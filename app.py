"""Maverick — Flask backend.

Boots, auto-seeds, serves the polished v5 prototype at / and the real backend
API at /api/*. The Jinja templates (/admin/*) remain available for inspection
of the real-data version.
"""
import os
import json
from flask import Flask, request, jsonify, render_template, redirect, url_for, abort, send_from_directory

from db import init_db, get_conn, is_seeded
from seed import seed_all
from extractor import extract_invoice
from audit import audit_invoice, audit_all
from recommender import recommend_container_actions, summary_kpis
from ranking import rank_carriers
from ai import summarize_exceptions, draft_email

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


# ============================================================
# Polished v5 prototype (Claude Design output) — served at /
# ============================================================
@app.route("/")
def proto_index():
    return send_from_directory(BASE_DIR, "prototype-v5.html")


@app.route("/styles.css")
def proto_css():
    return send_from_directory(BASE_DIR, "styles.css", mimetype="text/css")


@app.route("/app.js")
def proto_appjs():
    return send_from_directory(BASE_DIR, "app.js", mimetype="text/javascript")


@app.route("/data.js")
def proto_datajs():
    return send_from_directory(BASE_DIR, "data.js", mimetype="text/javascript")


@app.route("/screens.js")
def proto_screensjs():
    return send_from_directory(BASE_DIR, "screens.js", mimetype="text/javascript")


@app.route("/screens2.js")
def proto_screens2js():
    return send_from_directory(BASE_DIR, "screens2.js", mimetype="text/javascript")


@app.route("/workbook.json")
def proto_workbook():
    return send_from_directory(BASE_DIR, "workbook.json", mimetype="application/json")


# ============================================================
# Bootstrap
# ============================================================
@app.before_request
def _bootstrap():
    """Initialize + seed the DB on first request."""
    if not getattr(app, "_initialized", False):
        init_db()
        if not is_seeded():
            print("First boot — seeding DB from Excel.")
            seed_all()
            print("Running initial audit...")
            audit_all()
        app._initialized = True


# ============================================================
# Pages (server-rendered — kept at /admin/* for inspection alongside the
# polished v5 prototype). These pages show the SAME data the polished prototype
# shows, but with real-time backend rendering. Useful when validating that the
# audit engine and recommendation engine are producing correct outputs.
# ============================================================
@app.route("/admin")
@app.route("/admin/dashboard")
def dashboard():
    return render_template("dashboard.html", **_dashboard_context())


@app.route("/admin/loads")
def loads_page():
    conn = get_conn()
    loads = [dict(r) for r in conn.execute(
        "SELECT * FROM loads ORDER BY shipment_date DESC, fb_no").fetchall()]
    conn.close()
    return render_template("loads.html", loads=loads)


@app.route("/admin/loads/<fb_no>")
def load_detail_page(fb_no):
    conn = get_conn()
    load = conn.execute("SELECT * FROM loads WHERE fb_no = ?", (fb_no,)).fetchone()
    if not load:
        conn.close()
        abort(404)
    load = dict(load)
    container = None
    if load["container_no"]:
        c = conn.execute("SELECT * FROM containers WHERE number = ?", (load["container_no"],)).fetchone()
        container = dict(c) if c else None
    invoice = None
    if load["invoice_no"]:
        i = conn.execute("SELECT * FROM drayage_invoices WHERE invoice_no = ?", (load["invoice_no"],)).fetchone()
        invoice = dict(i) if i else None
    conn.close()
    milestones = _build_milestones(container, load)
    return render_template("load_detail.html", load=load, container=container,
                           invoice=invoice, milestones=milestones)


@app.route("/admin/containers")
def containers_page():
    conn = get_conn()
    containers = [dict(r) for r in conn.execute(
        "SELECT * FROM containers ORDER BY lfd").fetchall()]
    conn.close()
    actions = recommend_container_actions()
    kpis = summary_kpis()
    return render_template("containers.html", containers=containers, actions=actions, kpis=kpis)


@app.route("/admin/containers/<container_no>")
def container_detail_page(container_no):
    conn = get_conn()
    c = conn.execute("SELECT * FROM containers WHERE number = ?", (container_no,)).fetchone()
    if not c:
        conn.close()
        abort(404)
    container = dict(c)
    pos = [dict(r) for r in conn.execute(
        "SELECT * FROM purchase_orders WHERE container_no = ?", (container_no,)).fetchall()]
    invoices = [dict(r) for r in conn.execute(
        "SELECT * FROM drayage_invoices WHERE container_no = ?", (container_no,)).fetchall()]
    conn.close()
    milestones = _build_milestones(container, None)
    # find matching recommendation action
    action = next((a for a in recommend_container_actions() if a["container_no"] == container_no), None)
    return render_template("container_detail.html", container=container,
                           milestones=milestones, action=action, pos=pos, invoices=invoices)


def _build_milestones(container, load):
    """Build 7-milestone timeline. State = done | current | pending."""
    if not container:
        return []
    stage = container.get("stage", "")
    discharged = bool(container.get("discharge_date"))
    customs_cleared = container.get("customs_status") == "Cleared"
    ssl_released = container.get("ssl_released") == "Yes"
    picked_up = bool(container.get("pickup_date"))
    delivered = stage == "Delivered"
    returned = container.get("container_status") == "Returned"

    def st(done, current=False):
        return "done" if done else ("current" if current else "pending")

    return [
        {"name": "Vessel Arrival", "ts": container.get("discharge_date") or "Pending",
         "state": st(discharged, stage=="Awaiting Discharge")},
        {"name": "Discharge", "ts": container.get("discharge_date") or "—",
         "state": st(discharged, stage=="Awaiting Discharge")},
        {"name": "Customs Cleared", "ts": "Yes" if customs_cleared else container.get("customs_status",""),
         "state": st(customs_cleared, stage=="In Customs")},
        {"name": "SSL Released", "ts": "Yes" if ssl_released else "Pending",
         "state": st(ssl_released, stage=="Awaiting Release")},
        {"name": "Out-Gate Ready", "ts": "Ready" if (customs_cleared and ssl_released) else "Pending",
         "state": st(customs_cleared and ssl_released, stage=="Out-Gate Ready")},
        {"name": "Pickup", "ts": container.get("pickup_date") or "Pending",
         "state": st(picked_up)},
        {"name": "Delivered", "ts": container.get("pickup_date") if delivered else "Pending",
         "state": st(delivered)},
        {"name": "Empty Returned", "ts": "Done" if returned else "Pending",
         "state": st(returned)},
    ]


@app.route("/admin/drayage-invoices")
def drayage_invoices_page():
    status_filter = request.args.get("status", "Pending Review")
    conn = get_conn()
    if status_filter == "All":
        rows = conn.execute(
            "SELECT * FROM drayage_invoices ORDER BY invoice_date DESC").fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM drayage_invoices WHERE status = ? ORDER BY invoice_date DESC",
            (status_filter,)).fetchall()
    invoices = [dict(r) for r in rows]
    counts = {row["status"]: row["c"] for row in conn.execute(
        "SELECT status, COUNT(*) AS c FROM drayage_invoices GROUP BY status").fetchall()}
    counts["All"] = sum(counts.values())
    conn.close()
    return render_template("drayage_invoices.html", invoices=invoices,
                           counts=counts, status_filter=status_filter)


@app.route("/admin/drayage-invoices/<invoice_no>")
def drayage_invoice_detail(invoice_no):
    conn = get_conn()
    inv = conn.execute("SELECT * FROM drayage_invoices WHERE invoice_no = ?",
                       (invoice_no,)).fetchone()
    if not inv:
        abort(404)
    lines = [dict(r) for r in conn.execute(
        "SELECT * FROM drayage_invoice_lines WHERE invoice_no = ? ORDER BY line_no",
        (invoice_no,)).fetchall()]
    exceptions = [dict(r) for r in conn.execute(
        "SELECT * FROM audit_exceptions WHERE source_type='drayage_invoice' AND source_ref=?",
        (invoice_no,)).fetchall()]
    # ideal-vs-actual on the linehaul: look up the cheapest eligible rate for this lane
    inv = dict(inv)
    ideal_row = conn.execute(
        """SELECT carrier_name, base_rate FROM rate_card
           WHERE origin_terminal = ? AND destination_dc = ? ORDER BY base_rate LIMIT 1""",
        (inv["origin"], inv["destination"])).fetchone()
    ideal = dict(ideal_row) if ideal_row else None
    conn.close()
    return render_template("drayage_invoice_detail.html", inv=inv, lines=lines,
                           exceptions=exceptions, ideal=ideal)


@app.route("/admin/customs-invoices")
def customs_invoices_page():
    conn = get_conn()
    rows = [dict(r) for r in conn.execute("SELECT * FROM customs_invoices").fetchall()]
    conn.close()
    return render_template("customs_invoices.html", rows=rows)


@app.route("/admin/gl")
def gl_page():
    conn = get_conn()
    period = request.args.get("period", "2026-05")
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM gl_accruals WHERE period = ? ORDER BY account_code",
        (period,)).fetchall()]
    conn.close()
    return render_template("gl.html", rows=rows, period=period)


@app.route("/admin/rate-card")
def rate_card_page():
    conn = get_conn()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM rate_card ORDER BY lane_id").fetchall()]
    conn.close()
    return render_template("rate_card.html", rows=rows)


@app.route("/admin/transfers")
def transfers_page():
    conn = get_conn()
    transfers = [dict(r) for r in conn.execute(
        "SELECT * FROM transfer_requests ORDER BY transfer_id").fetchall()]
    p4_needs = [dict(r) for r in conn.execute(
        "SELECT * FROM p4_transfer_needs").fetchall()]
    conn.close()
    return render_template("transfers.html", transfers=transfers, p4_needs=p4_needs)


@app.route("/admin/scorecard")
def scorecard_page():
    conn = get_conn()
    carriers = [dict(r) for r in conn.execute(
        "SELECT * FROM carrier_scorecard ORDER BY composite_score DESC").fetchall()]
    conn.close()
    return render_template("scorecard.html", carriers=carriers)


@app.route("/admin/users")
def users_page():
    conn = get_conn()
    users = [dict(r) for r in conn.execute("SELECT * FROM users").fetchall()]
    conn.close()
    return render_template("users.html", users=users)


# ============================================================
# API endpoints
# ============================================================
@app.route("/api/kpis")
def api_kpis():
    return jsonify(_dashboard_context()["kpis"])


@app.route("/api/recommendations")
def api_recommendations():
    return jsonify(recommend_container_actions())


@app.route("/api/containers/summary")
def api_containers_summary():
    return jsonify(summary_kpis())


@app.route("/api/rank-carriers")
def api_rank_carriers():
    origin = request.args.get("origin", "")
    destination = request.args.get("destination", "")
    equipment = request.args.get("equipment", "40HC")
    criticality = request.args.get("criticality", "MEDIUM")
    return jsonify(rank_carriers(origin, destination, equipment, criticality))


@app.route("/api/drayage-invoices/upload", methods=["POST"])
def api_upload_drayage():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400
    path = os.path.join(UPLOADS_DIR, f.filename)
    f.save(path)

    # extract
    data = extract_invoice(path)

    # upsert into drayage_invoices
    conn = get_conn()
    try:
        conn.execute(
            """INSERT OR REPLACE INTO drayage_invoices (invoice_no, carrier_name, invoice_date,
                fb_no, container_no, bol, origin, destination, base_rate, fsc_pct, fsc_amount,
                accessorials_total, grand_total, status, source_pdf, extraction_confidence)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["invoice_no"], data["carrier_name"], data.get("invoice_date"),
                data.get("fb_no"), data.get("container_no"), data.get("bol"),
                data.get("origin"), data.get("destination"),
                data.get("base_rate", 0), data.get("fsc_pct", 0),
                data.get("fsc_amount", 0), data.get("accessorials_total", 0),
                data.get("grand_total", 0),
                "New", path, data.get("confidence", 1.0),
            ),
        )
        # replace lines
        conn.execute("DELETE FROM drayage_invoice_lines WHERE invoice_no = ?",
                     (data["invoice_no"],))
        for i, line in enumerate(data.get("lines", []), start=1):
            conn.execute(
                """INSERT INTO drayage_invoice_lines (invoice_no, line_no, line_type,
                    description, qty, rate, amount) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (data["invoice_no"], i, line["line_type"], line["description"],
                 line["qty"], line["rate"], line["amount"]),
            )
        conn.commit()
    finally:
        conn.close()

    # run audit
    findings = audit_invoice(data["invoice_no"])
    return jsonify({
        "invoice_no": data["invoice_no"],
        "carrier_name": data["carrier_name"],
        "grand_total": data["grand_total"],
        "extraction_confidence": data.get("confidence"),
        "findings": findings,
        "status": "Pending Review" if findings else "Complete",
    })


@app.route("/api/customs-invoices/upload", methods=["POST"])
def api_upload_customs():
    """Customs invoice upload — same shape as drayage but routes to customs audit."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400
    path = os.path.join(UPLOADS_DIR, f.filename)
    f.save(path)

    # Use the same extractor — Excel + PDF both supported
    data = extract_invoice(path)

    # Synth a customs response: validate duty math, MPF cap, brokerage cap
    findings = []
    # Heuristic: if file has "customs" or "broker" in name OR contains duty-like fields, treat as customs
    name_low = (f.filename or "").lower()
    is_customs_file = "customs" in name_low or "broker" in name_low or "duty" in str(data).lower()
    if is_customs_file:
        # Run customs-specific audit (placeholder rules)
        if data.get("grand_total", 0) > 50000:
            findings.append({
                "rule_family": "duty_math_check",
                "severity": "HIGH",
                "dollars_at_risk": round(data.get("grand_total", 0) * 0.02, 2),
                "description": "High-duty entry — recommend HS code review",
            })
    return jsonify({
        "entry_no": data.get("invoice_no"),
        "carrier_name": data.get("carrier_name"),
        "grand_total": data.get("grand_total", 0),
        "extraction_confidence": data.get("confidence"),
        "findings": findings,
        "status": "Pending Review" if findings else "Complete",
    })


@app.route("/api/drayage-invoices/<invoice_no>/approve", methods=["POST"])
def api_approve(invoice_no):
    conn = get_conn()
    conn.execute("UPDATE drayage_invoices SET status='Approved' WHERE invoice_no=?", (invoice_no,))
    conn.execute("UPDATE audit_exceptions SET status='Closed' WHERE source_type='drayage_invoice' AND source_ref=?", (invoice_no,))
    conn.commit()
    conn.close()
    return jsonify({"status": "Approved"})


@app.route("/api/drayage-invoices/<invoice_no>/reject", methods=["POST"])
def api_reject(invoice_no):
    conn = get_conn()
    conn.execute("UPDATE drayage_invoices SET status='In Dispute' WHERE invoice_no=?", (invoice_no,))
    conn.commit()
    conn.close()
    return jsonify({"status": "In Dispute"})


@app.route("/api/containers/<container_no>/action", methods=["POST"])
def api_container_action(container_no):
    """Generate email draft for dispatch / return / schedule."""
    body = request.json or {}
    kind = body.get("kind", "dispatch")
    conn = get_conn()
    c = conn.execute("SELECT * FROM containers WHERE number = ?", (container_no,)).fetchone()
    conn.close()
    if not c:
        return jsonify({"error": "Container not found"}), 404
    c = dict(c)
    if kind == "return":
        email = draft_email("dispatch_instruction", {
            "carrier_name": "Pacific Coastline Drayage",
            "container_no": container_no,
            "fb_no": "(empty return)",
            "pickup_window": "today",
            "reason": f"Empty return — container has dwelled {c.get('days_at_location','?')} days at the DC, detention accruing",
            "terminal": "NewAge DC → SSL empty depot",
        })
        email["subject"] = f"Empty Return Request — Container {container_no}"
    elif kind == "schedule":
        email = draft_email("dispatch_instruction", {
            "carrier_name": "Pacific Coastline Drayage",
            "container_no": container_no,
            "fb_no": "(scheduling)",
            "pickup_window": "next available terminal slot inside free time",
            "reason": "Pre-emptive scheduling to lock in capacity before LFD",
            "terminal": c.get("us_port", "the terminal"),
        })
        email["subject"] = f"Schedule Pickup — Container {container_no}"
    else:
        email = draft_email("dispatch_instruction", {
            "carrier_name": "Pacific Coastline Drayage",
            "container_no": container_no,
            "fb_no": "(direct dispatch)",
            "pickup_window": "within 24 hours",
            "reason": "Container Ready to Outgate; dispatch to avoid demurrage",
            "terminal": c.get("us_port", "the terminal"),
        })
    return jsonify({"email": email, "kind": kind})


@app.route("/api/drayage-invoices/<invoice_no>/dispute", methods=["POST"])
def api_dispute(invoice_no):
    conn = get_conn()
    inv = conn.execute("SELECT * FROM drayage_invoices WHERE invoice_no = ?",
                       (invoice_no,)).fetchone()
    if not inv:
        conn.close()
        return jsonify({"error": "Invoice not found"}), 404
    exc = conn.execute(
        "SELECT * FROM audit_exceptions WHERE source_type='drayage_invoice' AND source_ref=? "
        "ORDER BY dollars_at_risk DESC LIMIT 1", (invoice_no,)).fetchone()
    conn.execute("UPDATE drayage_invoices SET status='In Dispute' WHERE invoice_no=?",
                 (invoice_no,))
    conn.commit()
    inv_dict = dict(inv)
    if exc:
        exc = dict(exc)
        email = draft_email("dispute", {
            "carrier_name": inv_dict["carrier_name"],
            "invoice_no": invoice_no,
            "finding": exc["rule_family"],
            "dollars_at_risk": exc["dollars_at_risk"],
            "description": exc["description"],
        })
    else:
        email = {"to": "(unknown)", "subject": "(no exception)",
                 "body": "No exception found on this invoice."}
    conn.close()
    return jsonify({"status": "In Dispute", "email": email})


@app.route("/api/loads/dispatch", methods=["POST"])
def api_dispatch():
    """Single or batch dispatch. Body: {load_ids: [...]} or single container."""
    body = request.json or {}
    load_ids = body.get("load_ids", [])
    if not load_ids and body.get("container_no"):
        # find load by container
        conn = get_conn()
        r = conn.execute("SELECT fb_no FROM loads WHERE container_no = ? LIMIT 1",
                         (body["container_no"],)).fetchone()
        if r:
            load_ids = [r["fb_no"]]
        conn.close()
    if not load_ids:
        return jsonify({"error": "No loads specified"}), 400

    conn = get_conn()
    loads = [dict(r) for r in conn.execute(
        f"SELECT * FROM loads WHERE fb_no IN ({','.join('?'*len(load_ids))})",
        load_ids).fetchall()]
    # group by carrier
    by_carrier = {}
    for l in loads:
        by_carrier.setdefault(l["carrier_name"] or "Unassigned", []).append(l)

    emails = []
    for carrier, group in by_carrier.items():
        if len(group) == 1:
            email = draft_email("dispatch_instruction", {
                "carrier_name": carrier,
                "container_no": group[0]["container_no"],
                "fb_no": group[0]["fb_no"],
                "pickup_window": "the next 24 hours",
                "reason": "Container Ready to Outgate; LFD approaching",
                "terminal": group[0]["origin"],
            })
        else:
            email = draft_email("batch_dispatch", {
                "carrier_name": carrier,
                "loads": group,
            })
        emails.append(email)
        # update loads
        for l in group:
            conn.execute(
                "UPDATE loads SET status='Sent to Carrier', "
                "dispatch_sent_ts=CURRENT_TIMESTAMP WHERE fb_no=?",
                (l["fb_no"],))
    conn.commit()
    conn.close()
    return jsonify({"emails": emails, "load_ids": load_ids})


@app.route("/api/loads/prearrival-forecast", methods=["GET", "POST"])
def api_prearrival():
    # gather pre-arrival loads (Awaiting Discharge / In Customs / Awaiting Release)
    conn = get_conn()
    rows = conn.execute("""
        SELECT c.number, c.vessel, c.us_port, c.lfd, c.steamship_line, c.stage,
               l.fb_no, l.destination
        FROM containers c LEFT JOIN loads l ON l.container_no = c.number
        WHERE c.stage IN ('Awaiting Discharge', 'In Customs', 'Awaiting Release', 'Out-Gate Ready')
    """).fetchall()
    conn.close()

    by_carrier = {}
    for r in rows:
        by_carrier.setdefault("Pacific Coastline Drayage", []).append({
            "container_no": r["number"], "vessel": r["vessel"],
            "eta": r["lfd"], "terminal": r["us_port"],
            "destination": r["destination"] or "TBD",
        })

    emails = []
    for carrier, loads in by_carrier.items():
        email = draft_email("prearrival_forecast", {
            "carrier_name": carrier,
            "loads": loads,
            "week": "the week of 2026-05-17",
        })
        emails.append(email)
    return jsonify({"emails": emails, "carriers": list(by_carrier.keys())})


@app.route("/api/scorecard/<carrier_name>")
def api_scorecard_history(carrier_name):
    conn = get_conn()
    rows = [dict(r) for r in conn.execute(
        """SELECT di.invoice_no, ae.rule_family, ae.severity, ae.dollars_at_risk
           FROM audit_exceptions ae
           JOIN drayage_invoices di ON di.invoice_no = ae.source_ref
           WHERE di.carrier_name = ?
           ORDER BY ae.dollars_at_risk DESC LIMIT 20""", (carrier_name,)).fetchall()]
    conn.close()
    return jsonify(rows)


@app.route("/api/p4-transfer-needs")
def api_p4_needs():
    conn = get_conn()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM p4_transfer_needs WHERE status='Pending'").fetchall()]
    conn.close()
    return jsonify(rows)


@app.route("/api/audit-all", methods=["POST"])
def api_audit_all():
    return jsonify(audit_all())


# ============================================================
# Dashboard helpers
# ============================================================
def _dashboard_context():
    conn = get_conn()
    today = "2026-05-17"
    loads_today = conn.execute(
        "SELECT COUNT(*) AS c FROM loads WHERE shipment_date = ?", (today,)).fetchone()["c"]
    units_past_lfd = conn.execute(
        """SELECT COUNT(*) AS c FROM containers
           WHERE stage='Out-Gate Ready' AND pickup_date IS NULL AND lfd < ?""",
        (today,)).fetchone()["c"]
    units_dwelling = conn.execute(
        """SELECT COUNT(*) AS c FROM containers
           WHERE stage='Delivered' AND container_status='Empty' AND days_at_location > 7"""
    ).fetchone()["c"]
    active_invoices = conn.execute(
        "SELECT COUNT(*) AS c FROM drayage_invoices").fetchone()["c"]
    open_exceptions = conn.execute(
        "SELECT COUNT(*) AS c FROM audit_exceptions WHERE status='Open'").fetchone()["c"]
    at_risk = conn.execute(
        "SELECT COALESCE(SUM(dollars_at_risk),0) AS s FROM audit_exceptions WHERE status='Open'"
    ).fetchone()["s"]
    exceptions = [dict(r) for r in conn.execute(
        "SELECT * FROM audit_exceptions WHERE status='Open' ORDER BY dollars_at_risk DESC"
    ).fetchall()]
    conn.close()
    actions = recommend_container_actions()[:3]
    ai_summary = summarize_exceptions(exceptions)

    # Chart data — exceptions by rule
    rule_counts = {}
    for e in exceptions:
        rule_counts[e["rule_family"]] = rule_counts.get(e["rule_family"], 0) + 1
    sorted_rules = sorted(rule_counts.items(), key=lambda x: -x[1])
    chart_rules = {"labels": [r[0] for r in sorted_rules],
                   "counts": [r[1] for r in sorted_rules]}

    # Chart data — spend by carrier
    conn = get_conn()
    spend = conn.execute(
        """SELECT carrier_name, SUM(grand_total) AS total
           FROM drayage_invoices GROUP BY carrier_name ORDER BY total DESC""").fetchall()
    conn.close()
    chart_spend = {"labels": [r["carrier_name"] or "(unknown)" for r in spend],
                   "values": [round(r["total"] or 0, 2) for r in spend]}

    # Reminders — Stage 2 pre-arrival reminders
    reminders = [
        {"id": "pa1", "urgency": "Today",
         "title": "Send Refined Pre-Arrival List to PCD",
         "detail": "Vessel ONE OLYMPUS docks Friday 2026-05-21 (2 days out). 6 containers expected at LB Pier T."},
        {"id": "pa2", "urgency": "Tomorrow",
         "title": "Send Refined Pre-Arrival List to CDS",
         "detail": "Vessel MSC INGRID docks Saturday 2026-05-23. 3 containers expected at Tacoma."},
        {"id": "pa3", "urgency": "Today",
         "title": "Review Ready-to-Outgate queue",
         "detail": "2 containers Out-Gate Ready this week. Confirm dispatch schedule with PCD."},
    ]

    return {
        "kpis": {
            "loads_today": loads_today,
            "units_past_lfd": units_past_lfd,
            "units_dwelling_2d": units_dwelling,
            "active_invoices": active_invoices,
            "open_exceptions": open_exceptions,
            "at_risk": round(at_risk, 2),
        },
        "ai_summary": ai_summary,
        "actions": actions,
        "reminders": reminders,
        "chart_rules": chart_rules,
        "chart_spend": chart_spend,
    }


if __name__ == "__main__":
    init_db()
    if not is_seeded():
        print("First boot — seeding DB from Excel.")
        seed_all()
        print("Running initial audit...")
        audit_all()
    port = int(os.environ.get("PORT", 5050))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    print(f"Maverick running on http://{host}:{port}")
    app.run(host=host, port=port, debug=False)
