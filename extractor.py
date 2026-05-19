"""PDF invoice extractor.

Two paths:
  1. ANTHROPIC_API_KEY set -> Claude Sonnet 4 with native PDF input
  2. No key -> pdfplumber + regex deterministic parser

Both return the same JSON shape so audit logic is path-independent.
"""
import os
import re
import base64
import pdfplumber

ANTHROPIC_AVAILABLE = bool(os.environ.get("ANTHROPIC_API_KEY"))


def extract_invoice(pdf_path: str) -> dict:
    if ANTHROPIC_AVAILABLE:
        try:
            return _extract_via_anthropic(pdf_path)
        except Exception as e:
            print(f"  [warn] Anthropic extraction failed: {e}; falling back to regex")
    return _extract_via_regex(pdf_path)


# ----- deterministic regex path -----
def _extract_via_regex(pdf_path: str) -> dict:
    with pdfplumber.open(pdf_path) as pdf:
        all_tables = []
        for page in pdf.pages:
            all_tables.extend(page.extract_tables())
        line_table = None
        for t in all_tables:
            if not t or len(t) < 2:
                continue
            header = [c or "" for c in t[0]]
            if header and header[0].strip() == "#":
                line_table = t
                break
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)

    invoice_no = (
        _re1(r"\b([A-Z]{3,4}-INV-\d+)\b", text)
        or _re1(r"\b(PCD-\d+-W\d+-\d+)\b", text)
    )
    carrier_name = _detect_carrier(text)
    invoice_date = _re1(r"Invoice Date[\s\n]*?(\d{4}-\d{2}-\d{2})", text)
    shipment_date = _re1(r"Shipment Date[\s\n]*?(\d{4}-\d{2}-\d{2})", text)

    base_rate = 0.0
    fsc_pct = 0.0
    fsc_amount = 0.0
    lines = []

    if line_table:
        for row in line_table[1:]:
            row = [(c or "").replace("\n", " ").strip() for c in row]
            if not row[0] or not row[1]:
                continue
            line_type = "SHIPMENT" if "Shipment" in row[1] else "ACCESSORIAL"
            description = row[2]
            try:
                qty = float(row[3]) if row[3] and row[3] != "—" else 1
            except ValueError:
                qty = 1
            rate = _parse_money(row[4])
            amount = _parse_money(row[8])
            lines.append({
                "line_type": line_type, "description": description,
                "qty": qty, "rate": rate, "amount": amount,
            })
            if line_type == "SHIPMENT":
                base_rate = _parse_money(row[5]) or rate
                pct_str = row[6].replace("%", "").strip()
                try:
                    fsc_pct = float(pct_str) / 100.0
                except ValueError:
                    fsc_pct = 0.0
                fsc_amount = _parse_money(row[7])

    fb_no = _re1(r"FB#\s*/\s*Load\s*ID:\s*([A-Z0-9\-]+)", text)
    container_no = _re1(r"Container\s*#:\s*([A-Z]{4}\d+)", text)
    bol = _re1(r"BOL\s*/\s*MBL:\s*([A-Z0-9]+)", text)
    origin = _re1(r"Origin:\s*(.+)", text)
    destination = _re1(r"Destination:\s*(.+)", text)
    grand_total = _parse_money(_re1(r"GRAND TOTAL[^$]*\$([0-9,]+\.\d{2})", text) or "0")
    accessorials_total = sum(l["amount"] for l in lines if l["line_type"] == "ACCESSORIAL")

    return {
        "invoice_no": invoice_no or os.path.basename(pdf_path).replace(".pdf", ""),
        "carrier_name": carrier_name,
        "invoice_date": invoice_date or shipment_date,
        "fb_no": fb_no,
        "container_no": container_no,
        "bol": bol,
        "origin": origin,
        "destination": destination,
        "base_rate": base_rate,
        "fsc_pct": fsc_pct,
        "fsc_amount": fsc_amount,
        "accessorials_total": accessorials_total,
        "grand_total": grand_total,
        "lines": lines,
        "confidence": 0.92,
    }


def _detect_carrier(text: str) -> str:
    upper = text.upper()
    if "PACIFIC COASTLINE" in upper:
        return "Pacific Coastline Drayage"
    if "CONTINENTAL DRAYAGE" in upper:
        return "Continental Drayage Solutions"
    if "ATLANTIC CONTAINER" in upper:
        return "Atlantic Container Services"
    return "Unknown Carrier"


def _re1(pattern, text):
    m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
    return m.group(1).strip() if m else None


def _parse_money(s):
    if s is None or s == "—":
        return 0.0
    s = str(s).replace("$", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


# ----- AI path -----
def _extract_via_anthropic(pdf_path):
    import anthropic
    client = anthropic.Anthropic()
    with open(pdf_path, "rb") as f:
        pdf_b64 = base64.b64encode(f.read()).decode("utf-8")
    schema = {
        "type": "object",
        "properties": {
            "invoice_no": {"type": "string"},
            "carrier_name": {"type": "string"},
            "invoice_date": {"type": "string"},
            "fb_no": {"type": "string"},
            "container_no": {"type": "string"},
            "bol": {"type": "string"},
            "origin": {"type": "string"},
            "destination": {"type": "string"},
            "base_rate": {"type": "number"},
            "fsc_pct": {"type": "number"},
            "fsc_amount": {"type": "number"},
            "accessorials_total": {"type": "number"},
            "grand_total": {"type": "number"},
            "lines": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "line_type": {"type": "string", "enum": ["SHIPMENT", "ACCESSORIAL"]},
                        "description": {"type": "string"},
                        "qty": {"type": "number"},
                        "rate": {"type": "number"},
                        "amount": {"type": "number"},
                    },
                    "required": ["line_type", "description", "qty", "rate", "amount"],
                },
            },
        },
        "required": ["invoice_no", "carrier_name", "lines", "grand_total"],
    }
    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4000,
        tools=[{"name": "submit_invoice", "description": "Submit the parsed invoice data",
                "input_schema": schema}],
        tool_choice={"type": "tool", "name": "submit_invoice"},
        messages=[{
            "role": "user",
            "content": [
                {"type": "document",
                 "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64}},
                {"type": "text", "text":
                 "Extract this drayage invoice into the structured schema. "
                 "fsc_pct is a fraction 0-1 (so 22% = 0.22). "
                 "Include every shipment and every accessorial line."},
            ],
        }],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "submit_invoice":
            data = dict(block.input)
            data["confidence"] = 0.95
            return data
    raise RuntimeError("Anthropic returned no tool_use block")


if __name__ == "__main__":
    import sys, json
    if len(sys.argv) < 2:
        print("Usage: python extractor.py <pdf_path>")
        sys.exit(1)
    result = extract_invoice(sys.argv[1])
    print(json.dumps(result, indent=2, default=str))
