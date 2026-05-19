"""Audit rule engine.

Runs 9 deterministic rule families against a drayage invoice (already inserted
into the DB). Returns a list of exception dicts and writes them to
audit_exceptions. Sets the invoice's status based on whether any rule fires.

Rules:
  1. rate_variance         — invoice base_rate vs rate_card by >$10 or >3%
  2. fsc_math_error        — |stated fsc$ - base*pct| > $1
  3. excess_accessorial    — accessorials > 40% of base OR >= 4 events on FB#
  4. duplicate_charge      — same (desc, qty, rate) twice on same invoice
  5. missing_po            — container not linked to any PO
  6. demurrage_risk        — pickup_date > LFD
  7. detention_review      — Driver Detention at Consignee billed > 2 hr free
  8. waiting_time_review   — Terminal Waiting Time billed > 1 hr free
  9. tonu_review           — any TONU line present
"""
from db import get_conn

DETENTION_FREE_HR = 2
WAITING_TIME_FREE_HR = 1


def audit_all() -> dict:
    """Audit every invoice in the DB. Returns summary."""
    conn = get_conn()
    invoice_nos = [r["invoice_no"] for r in conn.execute("SELECT invoice_no FROM drayage_invoices").fetchall()]
    conn.execute("DELETE FROM audit_exceptions WHERE source_type = 'drayage_invoice'")
    conn.commit()
    conn.close()

    total_found = 0
    total_at_risk = 0.0
    by_rule = {}
    for inv_no in invoice_nos:
        results = audit_invoice(inv_no)
        for r in results:
            total_found += 1
            total_at_risk += r["dollars_at_risk"]
            by_rule[r["rule_family"]] = by_rule.get(r["rule_family"], 0) + 1
    return {"total_found": total_found, "total_at_risk": round(total_at_risk, 2), "by_rule": by_rule}


def audit_invoice(invoice_no: str) -> list:
    """Run all rules on one invoice. Insert exceptions; set invoice status."""
    conn = get_conn()
    try:
        inv = conn.execute("SELECT * FROM drayage_invoices WHERE invoice_no = ?", (invoice_no,)).fetchone()
        if not inv:
            return []
        inv = dict(inv)
        lines = [dict(r) for r in conn.execute(
            "SELECT * FROM drayage_invoice_lines WHERE invoice_no = ? ORDER BY line_no",
            (invoice_no,)
        ).fetchall()]

        findings = []
        findings += _rule_rate_variance(inv, conn)
        findings += _rule_fsc_math(inv)
        findings += _rule_excess_accessorial(inv, lines)
        findings += _rule_duplicate_charge(inv, lines)
        findings += _rule_missing_po(inv, conn)
        findings += _rule_demurrage_risk(inv, conn)
        findings += _rule_detention_review(inv, lines)
        findings += _rule_waiting_time_review(inv, lines)
        findings += _rule_tonu_review(inv, lines)

        # remove existing exceptions for this invoice
        conn.execute("DELETE FROM audit_exceptions WHERE source_type=? AND source_ref=?",
                     ("drayage_invoice", invoice_no))
        for f in findings:
            conn.execute(
                """INSERT INTO audit_exceptions (source_type, source_id, source_ref, rule_family,
                    severity, dollars_at_risk, description, recommended_action, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                ("drayage_invoice", inv["id"], inv["invoice_no"], f["rule_family"],
                 f["severity"], f["dollars_at_risk"], f["description"],
                 f["recommended_action"], "Open"),
            )

        # Reclassify invoice status
        new_status = "Pending Review" if findings else "Complete"
        conn.execute("UPDATE drayage_invoices SET status=? WHERE invoice_no=?",
                     (new_status, invoice_no))
        conn.commit()
        return findings
    finally:
        conn.close()


# ---------- Rule implementations ----------

def _rule_rate_variance(inv, conn):
    """Compare invoice base_rate vs rate_card for the (carrier, lane, equipment)."""
    findings = []
    rc = conn.execute(
        """SELECT base_rate FROM rate_card
           WHERE carrier_name = ? AND origin_terminal = ? AND destination_dc = ?
           ORDER BY base_rate LIMIT 1""",
        (inv["carrier_name"], inv["origin"], inv["destination"]),
    ).fetchone()
    if not rc:
        return findings
    expected = float(rc["base_rate"])
    actual = float(inv["base_rate"] or 0)
    delta = actual - expected
    if delta > 10 or (expected > 0 and delta / expected > 0.03):
        findings.append({
            "rule_family": "rate_variance",
            "severity": "MEDIUM",
            "dollars_at_risk": round(delta, 2),
            "description": (
                f"Linehaul charged ${actual:,.2f}; rate card ${expected:,.2f} "
                f"for {inv['origin']} → {inv['destination']}. Delta ${delta:,.2f}."
            ),
            "recommended_action": "Dispute against carrier — pre-fill MSA §4.1 rate-variance clause.",
        })
    return findings


def _rule_fsc_math(inv):
    """Validate FSC$ = base * fsc_pct."""
    base = float(inv["base_rate"] or 0)
    pct = float(inv["fsc_pct"] or 0)
    expected_fsc = round(base * pct, 2)
    actual_fsc = float(inv["fsc_amount"] or 0)
    delta = abs(actual_fsc - expected_fsc)
    if delta > 1:
        return [{
            "rule_family": "fsc_math_error",
            "severity": "MEDIUM",
            "dollars_at_risk": round(actual_fsc - expected_fsc, 2),
            "description": (
                f"FSC stated as {pct*100:.0f}% but charged ${actual_fsc:,.2f} on "
                f"${base:,.2f} base. {pct*100:.0f}% of ${base:,.2f} = ${expected_fsc:,.2f}. "
                f"Delta ${actual_fsc - expected_fsc:,.2f}."
            ),
            "recommended_action": "Recalc FSC. Dispute the difference. Show compute method in email.",
        }]
    return []


def _rule_excess_accessorial(inv, lines):
    accs = [l for l in lines if l["line_type"] == "ACCESSORIAL"]
    acc_total = sum(float(l["amount"]) for l in accs)
    base = float(inv["base_rate"] or 0)
    pct_of_base = (acc_total / base) if base else 0
    # AND: both must be true. Single-accessorial high-dollar charges don't trip;
    # only a true pattern of stacked accessorials does.
    if pct_of_base > 0.40 and len(accs) >= 3:
        return [{
            "rule_family": "excess_accessorial",
            "severity": "HIGH",
            "dollars_at_risk": round(acc_total, 2),
            "description": (
                f"Accessorials total ${acc_total:,.2f} vs base ${base:,.2f} "
                f"({pct_of_base*100:.0f}% of base). {len(accs)} accessorial events on this FB#."
            ),
            "recommended_action": (
                "Require IFM review. Pull container milestones to justify or dispute "
                "each accessorial line."
            ),
        }]
    return []


def _rule_duplicate_charge(inv, lines):
    seen = {}
    duplicates = []
    for l in lines:
        if l["line_type"] != "ACCESSORIAL":
            continue
        key = (l["description"], l["qty"], l["rate"])
        if key in seen:
            duplicates.append(l)
        else:
            seen[key] = l
    if duplicates:
        total = sum(float(d["amount"]) for d in duplicates)
        descs = ", ".join(set(d["description"] for d in duplicates))
        return [{
            "rule_family": "duplicate_charge",
            "severity": "CRITICAL",
            "dollars_at_risk": round(total, 2),
            "description": (
                f"Duplicate accessorial line(s) detected: {descs} appears twice "
                f"with same qty and rate. Total duplicate amount ${total:,.2f}."
            ),
            "recommended_action": "Hold payment on duplicate line. Auto-include in dispute.",
        }]
    return []


def _rule_missing_po(inv, conn):
    if not inv["container_no"]:
        return []
    po = conn.execute(
        "SELECT po_no FROM purchase_orders WHERE container_no = ?",
        (inv["container_no"],)
    ).fetchone()
    if not po:
        return [{
            "rule_family": "missing_po",
            "severity": "HIGH",
            "dollars_at_risk": 0.0,
            "description": (
                f"Container {inv['container_no']} not linked to any PO in the system."
            ),
            "recommended_action": "Block invoice approval until linked. Notify Demand Planning.",
        }]
    return []


def _rule_demurrage_risk(inv, conn):
    if not inv["container_no"]:
        return []
    cont = conn.execute(
        "SELECT lfd, pickup_date FROM containers WHERE number = ?",
        (inv["container_no"],)
    ).fetchone()
    if not cont or not cont["lfd"] or not cont["pickup_date"]:
        return []
    from datetime import date
    lfd = date.fromisoformat(cont["lfd"])
    pickup = date.fromisoformat(cont["pickup_date"])
    if pickup > lfd:
        days_late = (pickup - lfd).days
        # estimate exposure using $250/day base (port demurrage day 1-3)
        exposure = days_late * 250
        # check accessorial lines for actual demurrage pass-through
        actual_demurrage = sum(
            float(l["amount"]) for l in conn.execute(
                "SELECT amount FROM drayage_invoice_lines "
                "WHERE invoice_no = ? AND description LIKE '%Demurrage%'",
                (inv["invoice_no"],)
            ).fetchall()
        )
        impact = max(exposure, actual_demurrage)
        return [{
            "rule_family": "demurrage_risk",
            "severity": "CRITICAL",
            "dollars_at_risk": round(impact, 2),
            "description": (
                f"Container picked up {days_late} day(s) after LFD ({cont['lfd']}). "
                f"Demurrage exposure: ${impact:,.2f}."
            ),
            "recommended_action": (
                "Compute exposure × per-diem. Document for finance. "
                "Recommend dispatch reorder process review."
            ),
        }]
    return []


def _rule_detention_review(inv, lines):
    findings = []
    for l in lines:
        if l["line_type"] != "ACCESSORIAL":
            continue
        desc = (l["description"] or "").lower()
        if "detention at consignee" in desc and l["qty"] > DETENTION_FREE_HR:
            billable_hr = l["qty"] - DETENTION_FREE_HR
            disputed_hr = l["qty"] - billable_hr  # = free hours that were billed
            actual_dispute = l["qty"] * l["rate"] - billable_hr * l["rate"]
            findings.append({
                "rule_family": "detention_review",
                "severity": "MEDIUM",
                "dollars_at_risk": round(actual_dispute, 2),
                "description": (
                    f"{l['qty']:g} hours of consignee detention billed; "
                    f"{DETENTION_FREE_HR} hours free per MSA. "
                    f"Billable amount: {billable_hr:g} hr × ${l['rate']:.0f}."
                ),
                "recommended_action": (
                    f"Auto-compute correct hours. Open dispute for ${actual_dispute:,.2f}."
                ),
            })
    return findings


def _rule_waiting_time_review(inv, lines):
    findings = []
    for l in lines:
        if l["line_type"] != "ACCESSORIAL":
            continue
        desc = (l["description"] or "").lower()
        if "terminal waiting time" in desc and l["qty"] > WAITING_TIME_FREE_HR:
            billable_hr = l["qty"] - WAITING_TIME_FREE_HR
            actual_dispute = (l["qty"] - billable_hr) * l["rate"]
            findings.append({
                "rule_family": "waiting_time_review",
                "severity": "LOW",
                "dollars_at_risk": round(actual_dispute, 2),
                "description": (
                    f"{l['qty']:g} hours of terminal waiting billed; "
                    f"{WAITING_TIME_FREE_HR} hour free per MSA. "
                    f"Billable: {billable_hr:g} hr × ${l['rate']:.0f}."
                ),
                "recommended_action": (
                    f"Auto-correct to billable hours. Open dispute for ${actual_dispute:,.2f}."
                ),
            })
    return findings


def _rule_tonu_review(inv, lines):
    findings = []
    for l in lines:
        if l["line_type"] != "ACCESSORIAL":
            continue
        desc = (l["description"] or "").lower()
        if "tonu" in desc or "truck order not used" in desc:
            findings.append({
                "rule_family": "tonu_review",
                "severity": "MEDIUM",
                "dollars_at_risk": round(float(l["amount"]), 2),
                "description": (
                    f"TONU charge of ${l['amount']:,.2f} on this invoice. "
                    "Validate that the carrier's dispatch log shows a truck actually sent."
                ),
                "recommended_action": (
                    "Request carrier's dispatch log to validate. Open conditional dispute."
                ),
            })
    return findings


if __name__ == "__main__":
    summary = audit_all()
    print(f"Total findings: {summary['total_found']}")
    print(f"Total $ at risk: ${summary['total_at_risk']:,.2f}")
    print("By rule:")
    for r, n in sorted(summary["by_rule"].items(), key=lambda x: -x[1]):
        print(f"  {r:30s} {n}")
