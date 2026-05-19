"""Container action recommendation engine.

Stage-gated. Recommendations fire ONLY on:
  - stage = 'Out-Gate Ready'  (port-side actions)
  - stage = 'Delivered' AND container_status = 'Empty' AND days_at_location > 5
    (DC-side detention actions)

Six tactics:
  1. Past LFD at port — CRITICAL demurrage accruing
  2. Approaching LFD at port — HIGH/MEDIUM, preventive dispatch
  3. Consignee detention — Empty containers dwelling > consignee free time
  4. Schedule appointment — Out-Gate Ready, safe LFD
  5. Stop the bleed on already-late returns
  6. Accessorial pattern diagnostic (aggregate, trailing 90d)
"""
from datetime import date
from db import get_conn

TODAY = date(2026, 5, 17)  # demo "today"
CONSIGNEE_FREE_TIME_DAYS = 5

# Per-diem ladder defaults (in dollars/day). Real values pulled from per_diem_ladder.
DEFAULT_DEMURRAGE = {1: 250, 4: 375, 8: 500}
DEFAULT_DETENTION = {1: 150, 4: 225, 8: 325}


def recommend_container_actions() -> list:
    """Run all tactics; return ranked list of actions."""
    conn = get_conn()
    try:
        containers = conn.execute("SELECT * FROM containers").fetchall()
        actions = []
        for c in containers:
            c = dict(c)
            actions += _tactic_past_lfd_port(c, conn)
            actions += _tactic_approaching_lfd(c, conn)
            actions += _tactic_consignee_detention(c, conn)
            actions += _tactic_schedule_appointment(c, conn)
        # rank
        priority_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        actions.sort(key=lambda a: (priority_order.get(a["priority"], 99),
                                     -(a.get("dollars_saved") or 0)))
        return actions
    finally:
        conn.close()


def summary_kpis() -> dict:
    """KPI tiles for the Containers page."""
    actions = recommend_container_actions()
    units_past_lfd = sum(1 for a in actions if a["category"] == "demurrage_avoidance"
                         and a["priority"] == "CRITICAL"
                         and "past lfd" in (a.get("rationale_text") or "").lower())
    units_dwelling = sum(1 for a in actions if a["category"] == "detention_avoidance")
    demurrage_exposure = sum((a.get("dollars_saved") or 0) for a in actions
                              if a["category"] == "demurrage_avoidance"
                              and a["priority"] == "CRITICAL")
    detention_exposure = sum((a.get("dollars_saved") or 0) for a in actions
                              if a["category"] == "detention_avoidance")
    return {
        "units_past_lfd": units_past_lfd,
        "units_dwelling_2d": units_dwelling,
        "demurrage_exposure": round(demurrage_exposure, 2),
        "detention_exposure": round(detention_exposure, 2),
    }


# ---------- Tactic implementations ----------

def _tactic_past_lfd_port(c, conn):
    """Stage=Out-Gate Ready, pickup_date is null, today > LFD."""
    if c["stage"] != "Out-Gate Ready" or c["pickup_date"]:
        return []
    if not c["lfd"]:
        return []
    lfd = date.fromisoformat(c["lfd"])
    if TODAY <= lfd:
        return []
    days_past = (TODAY - lfd).days
    accrued = _demurrage_accrued(c["steamship_line"], days_past, conn)
    next_day_rate = _demurrage_daily_rate(c["steamship_line"], days_past + 1, conn)
    return [{
        "container_no": c["number"],
        "stage": c["stage"],
        "container_status": c["container_status"],
        "priority": "CRITICAL",
        "category": "demurrage_avoidance",
        "action_text": f"DISPATCH IMMEDIATELY — {days_past}d past LFD",
        "rationale_text": (
            f"{days_past} day(s) past LFD ({c['lfd']}), demurrage accruing. "
            f"${accrued:,.0f} already incurred. Every additional day adds "
            f"${next_day_rate:,.0f}."
        ),
        "dollars_saved": accrued,
        "linked_endpoint": f"/api/loads/dispatch?container={c['number']}",
    }]


def _tactic_approaching_lfd(c, conn):
    """Out-Gate Ready, not yet past LFD, but within 2 days."""
    if c["stage"] != "Out-Gate Ready" or c["pickup_date"]:
        return []
    if not c["lfd"]:
        return []
    lfd = date.fromisoformat(c["lfd"])
    if TODAY > lfd:
        return []
    days_to_lfd = (lfd - TODAY).days
    if days_to_lfd > 2:
        return []
    if days_to_lfd == 0:
        priority = "CRITICAL"
        prefix = "Dispatch TODAY — LFD is today"
    elif days_to_lfd == 1:
        priority = "HIGH"
        prefix = "Dispatch by EOD — LFD tomorrow"
    else:
        priority = "MEDIUM"
        prefix = f"Dispatch within {days_to_lfd} day(s)"
    saved = _demurrage_daily_rate(c["steamship_line"], 1, conn)
    appt = _next_terminal_slot(c["us_port"], conn)
    appt_text = (f" Next slot: {appt['terminal']} {appt['next_available_date']} "
                 f"{appt['window']} ({appt['open_slots']} open)") if appt else ""
    return [{
        "container_no": c["number"],
        "stage": c["stage"],
        "container_status": c["container_status"],
        "priority": priority,
        "category": "demurrage_avoidance",
        "action_text": prefix,
        "rationale_text": (
            f"{days_to_lfd} day(s) to LFD ({c['lfd']}). "
            f"Avoid ${saved:,.0f}/day demurrage.{appt_text}"
        ),
        "dollars_saved": saved,
        "linked_endpoint": f"/api/loads/dispatch?container={c['number']}",
    }]


def _tactic_consignee_detention(c, conn):
    """Stage=Delivered, container_status=Empty, dwelling > 5 days."""
    if c["stage"] != "Delivered" or c["container_status"] != "Empty":
        return []
    days_at = c["days_at_location"] or 0
    if days_at <= CONSIGNEE_FREE_TIME_DAYS:
        return []
    days_over = days_at - CONSIGNEE_FREE_TIME_DAYS
    accrued = _detention_accrued(c["steamship_line"], days_over, conn)
    daily_rate = _detention_daily_rate(c["steamship_line"], days_over, conn)
    if days_over >= 5:
        priority = "HIGH"
    elif days_over >= 2:
        priority = "MEDIUM"
    else:
        priority = "LOW"
    return [{
        "container_no": c["number"],
        "stage": c["stage"],
        "container_status": c["container_status"],
        "priority": priority,
        "category": "detention_avoidance",
        "action_text": "Schedule empty return TODAY",
        "rationale_text": (
            f"{days_over}d past consignee free time. ${accrued:,.0f} detention "
            f"accrued. Daily exposure: ${daily_rate:,.0f}/day until empty is returned."
        ),
        "dollars_saved": accrued,
        "linked_endpoint": f"/api/loads/return-empty?container={c['number']}",
    }]


def _tactic_schedule_appointment(c, conn):
    """Out-Gate Ready, LFD > 2 days away — preventive booking."""
    if c["stage"] != "Out-Gate Ready" or c["pickup_date"]:
        return []
    if not c["lfd"]:
        return []
    lfd = date.fromisoformat(c["lfd"])
    if TODAY > lfd:
        return []
    days_to_lfd = (lfd - TODAY).days
    if days_to_lfd <= 2:
        return []  # handled by approaching_lfd
    appt = _next_terminal_slot(c["us_port"], conn)
    appt_text = (f"Next slot: {appt['terminal']} {appt['next_available_date']} "
                 f"{appt['window']} ({appt['open_slots']} open).") if appt else ""
    return [{
        "container_no": c["number"],
        "stage": c["stage"],
        "container_status": c["container_status"],
        "priority": "LOW",
        "category": "demurrage_avoidance",
        "action_text": "Book terminal appointment this week (preventive)",
        "rationale_text": (
            f"{days_to_lfd} day(s) of buffer to LFD. {appt_text} Locks in capacity."
        ),
        "dollars_saved": 0,
        "linked_endpoint": f"/api/loads/schedule?container={c['number']}",
    }]


# ---------- Lookups ----------

def _per_diem_row(ssl_short, conn):
    """Match SSL short name to per_diem_ladder row (best-effort)."""
    if not ssl_short:
        return None
    # try exact, then fuzzy contains
    row = conn.execute("SELECT * FROM per_diem_ladder WHERE steamship_line = ?", (ssl_short,)).fetchone()
    if row:
        return dict(row)
    # try LIKE
    row = conn.execute("SELECT * FROM per_diem_ladder WHERE steamship_line LIKE ?", (f"%{ssl_short}%",)).fetchone()
    if row:
        return dict(row)
    return None


def _demurrage_daily_rate(ssl, day_position, conn):
    row = _per_diem_row(ssl, conn)
    if not row:
        # use defaults
        if day_position <= 3:
            return DEFAULT_DEMURRAGE[1]
        elif day_position <= 7:
            return DEFAULT_DEMURRAGE[4]
        else:
            return DEFAULT_DEMURRAGE[8]
    if day_position <= 3:
        return row["demurrage_d1_3"]
    elif day_position <= 7:
        return row["demurrage_d4_7"]
    else:
        return row["demurrage_d8_plus"]


def _demurrage_accrued(ssl, days_past, conn):
    return sum(_demurrage_daily_rate(ssl, d, conn) for d in range(1, days_past + 1))


def _detention_daily_rate(ssl, day_position, conn):
    row = _per_diem_row(ssl, conn)
    if not row:
        if day_position <= 3:
            return DEFAULT_DETENTION[1]
        elif day_position <= 7:
            return DEFAULT_DETENTION[4]
        else:
            return DEFAULT_DETENTION[8]
    if day_position <= 3:
        return row["detention_d1_3"]
    elif day_position <= 7:
        return row["detention_d4_7"]
    else:
        return row["detention_d8_plus"]


def _detention_accrued(ssl, days_over, conn):
    return sum(_detention_daily_rate(ssl, d, conn) for d in range(1, days_over + 1))


def _next_terminal_slot(us_port, conn):
    if not us_port:
        return None
    # rough mapping from us_port to terminal name
    # us_port = "Long Beach, CA" → match terminals containing "Long Beach"
    city = us_port.split(",")[0].strip() if us_port else ""
    row = conn.execute(
        "SELECT * FROM terminal_appointments WHERE terminal LIKE ? "
        "ORDER BY next_available_date LIMIT 1", (f"%{city}%",)
    ).fetchone()
    return dict(row) if row else None


if __name__ == "__main__":
    actions = recommend_container_actions()
    print(f"Total actions: {len(actions)}")
    print()
    print("Recommendations (ranked):")
    for a in actions:
        print(f"  [{a['priority']:8s}] {a['container_no']:14s} "
              f"({a['category']:25s}) {a['action_text']}")
        print(f"           ${(a.get('dollars_saved') or 0):,.0f} | {a['rationale_text']}")
        print()
    print()
    print("Summary KPIs:")
    for k, v in summary_kpis().items():
        print(f"  {k}: {v}")
