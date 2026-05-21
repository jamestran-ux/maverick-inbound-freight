"""Extraction accuracy harness.

Generates the 6 varied PDFs, runs extract_invoice() on each (regex path only —
Anthropic key is force-disabled), compares extracted fields to ground truth,
prints a per-file scorecard, and aggregates overall accuracy %.

Run from inside maverick_backend/:
    python3 test_invoices/_test_extraction.py
"""
import os
import sys
import importlib

# Force the deterministic regex path so we're measuring the extractor we ship
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ["ANTHROPIC_API_KEY"] = ""

# Path setup so we can import siblings
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, REPO)
sys.path.insert(0, HERE)

import extractor  # noqa
importlib.reload(extractor)  # ensure ANTHROPIC_AVAILABLE re-evaluates
extractor.ANTHROPIC_AVAILABLE = False  # belt-and-suspenders

import _generate_varied  # noqa


# ---------- field comparators ----------
def _money_close(a, b, tol=0.51):
    try: return abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError): return False

def _str_contains(extracted, expected_substring):
    if extracted is None: return False
    return expected_substring.lower() in str(extracted).lower()

def _str_eq(a, b):
    if a is None or b is None: return False
    return str(a).strip().upper() == str(b).strip().upper()


SCORE_RULES = {
    "invoice_no":       ("eq",        "invoice_no"),
    "carrier":          ("contains",  "carrier_name_contains"),
    "invoice_date":     ("eq",        "invoice_date"),
    "fb_no":            ("eq",        "fb_no"),
    "container_no":     ("eq",        "container_no"),
    "bol":              ("eq",        "bol"),
    "origin":           ("contains",  "origin_contains"),
    "destination":      ("contains",  "destination_contains"),
    "base_rate":        ("money",     "base_rate"),
    "fsc_amount":       ("money",     "fsc_amount"),
    "accessorials":     ("money",     "accessorials_total"),
    "grand_total":      ("money",     "grand_total"),
}


def score_drayage(extracted, expected):
    """Return list of (field, status, ext_val, exp_val) tuples."""
    rows = []
    for field, (mode, exp_key) in SCORE_RULES.items():
        if exp_key not in expected:
            rows.append((field, "skip", None, None))
            continue
        if field == "carrier":
            ext = extracted.get("carrier_name")
        elif field == "accessorials":
            ext = extracted.get("accessorials_total")
        else:
            ext = extracted.get(field)
        exp = expected[exp_key]
        if mode == "eq":
            ok = _str_eq(ext, exp)
        elif mode == "contains":
            ok = _str_contains(ext, exp)
        elif mode == "money":
            ok = _money_close(ext, exp)
        else:
            ok = False
        rows.append((field, "hit" if ok else "miss", ext, exp))
    return rows


def score_customs(extracted, expected):
    rows = []
    if expected.get("invoice_no"):
        ok = _str_eq(extracted.get("invoice_no"), expected["invoice_no"])
        rows.append(("invoice_no", "hit" if ok else "miss", extracted.get("invoice_no"), expected["invoice_no"]))
    if expected.get("grand_total") is not None:
        ok = _money_close(extracted.get("grand_total"), expected["grand_total"])
        rows.append(("grand_total", "hit" if ok else "miss", extracted.get("grand_total"), expected["grand_total"]))
    ext_lines = [l for l in (extracted.get("lines") or []) if l.get("line_type") == "CUSTOMS_ENTRY"]
    exp_entries = expected.get("entries", [])
    rows.append(("entry_count",
                 "hit" if len(ext_lines) == len(exp_entries) else "miss",
                 len(ext_lines), len(exp_entries)))
    # Per-entry field hits (by index)
    for i, exp in enumerate(exp_entries):
        if i >= len(ext_lines):
            rows.append((f"entry[{i}].container", "miss", None, exp["container"]))
            rows.append((f"entry[{i}].po", "miss", None, exp["po"]))
            rows.append((f"entry[{i}].subtotal", "miss", None, exp["subtotal"]))
            continue
        ln = ext_lines[i]
        rows.append((f"entry[{i}].entry",     "hit" if _str_eq(ln.get("entry"), exp["entry"]) else "miss",       ln.get("entry"), exp["entry"]))
        rows.append((f"entry[{i}].container", "hit" if _str_eq(ln.get("container"), exp["container"]) else "miss", ln.get("container"), exp["container"]))
        rows.append((f"entry[{i}].po",        "hit" if _str_eq(ln.get("po"), exp["po"]) else "miss",            ln.get("po"), exp["po"]))
        rows.append((f"entry[{i}].subtotal",  "hit" if _money_close(ln.get("subtotal"), exp["subtotal"]) else "miss", ln.get("subtotal"), exp["subtotal"]))
    return rows


def fmt(val, w=22):
    s = "" if val is None else str(val)
    return (s[:w-1] + "…") if len(s) > w else s.ljust(w)


def main():
    print()
    print("=" * 92)
    print(f"  EXTRACTOR ACCURACY HARNESS  ·  ANTHROPIC_AVAILABLE={extractor.ANTHROPIC_AVAILABLE}")
    print("=" * 92)

    total_hits = 0
    total_attempts = 0

    for gen in _generate_varied.GENERATORS:
        path, expected = gen()
        extracted = extractor.extract_invoice(path)
        is_customs = expected.get("is_customs", False)
        rows = score_customs(extracted, expected) if is_customs else score_drayage(extracted, expected)

        file_hits = sum(1 for r in rows if r[1] == "hit")
        file_attempts = sum(1 for r in rows if r[1] in ("hit", "miss"))
        pct = (100 * file_hits / file_attempts) if file_attempts else 0
        total_hits += file_hits
        total_attempts += file_attempts

        print()
        print(f"  {os.path.basename(path)}    {file_hits}/{file_attempts}  ({pct:.0f}%)")
        print("  " + "-" * 88)
        print(f"  {'field':<22} {'status':<6} {'extracted':<28} {'expected'}")
        for field, status, ext, exp in rows:
            mark = "✓" if status == "hit" else ("·" if status == "skip" else "✗")
            print(f"  {field:<22} {mark} {status:<5} {fmt(ext, 28)} {fmt(exp, 30)}")

    overall = (100 * total_hits / total_attempts) if total_attempts else 0
    print()
    print("=" * 92)
    print(f"  OVERALL: {total_hits}/{total_attempts} fields  ({overall:.1f}%)")
    print("=" * 92)
    print()


if __name__ == "__main__":
    main()
