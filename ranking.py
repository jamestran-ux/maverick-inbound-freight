"""Carrier ranking — composite + criticality + hard threshold.

Composite formula:
  composite = 0.30*on_time_pickup + 0.25*on_time_delivery + 0.20*invoice_accuracy
            + 0.15*(100-accessorial_pct) + 0.10*dispute_win_rate

Lane criticality weighting:
  HIGH:   70% composite × 30% cost.  Hard floor: composite >= 85.
  MEDIUM: 50% composite × 50% cost.  Hard floor: composite >= 78.
  LOW:    30% composite × 70% cost.  No hard floor.
"""
from db import get_conn


WEIGHTS = {
    "HIGH":   {"composite": 0.70, "cost": 0.30, "floor": 85.0},
    "MEDIUM": {"composite": 0.50, "cost": 0.50, "floor": 78.0},
    "LOW":    {"composite": 0.30, "cost": 0.70, "floor": None},
}


def rank_carriers(origin: str, destination: str, equipment: str = "40HC",
                  criticality: str = "MEDIUM") -> dict:
    conn = get_conn()
    try:
        # 1. Find all carriers in rate_card serving this lane
        rates = conn.execute(
            """SELECT rc.*, cs.composite_score, cs.on_time_pickup, cs.on_time_delivery,
                cs.invoice_accuracy, cs.accessorial_pct, cs.dispute_win_rate
               FROM rate_card rc
               LEFT JOIN carrier_scorecard cs ON rc.carrier_name = cs.carrier_name
               WHERE rc.origin_terminal = ? AND rc.destination_dc = ?
                 AND rc.equipment = ?""",
            (origin, destination, equipment),
        ).fetchall()
        if not rates:
            return {"lane": f"{origin} → {destination}", "criticality": criticality,
                    "weighting": WEIGHTS.get(criticality, WEIGHTS["MEDIUM"]),
                    "eligible": [], "excluded": [],
                    "note": "No carriers in rate card for this lane/equipment."}

        # 2. Capacity lookup (best-effort: by carrier name, any lane_group)
        capacities = {
            r["carrier_name"]: r["available"]
            for r in conn.execute("SELECT carrier_name, available FROM carrier_capacity").fetchall()
        }

        w = WEIGHTS.get(criticality.upper(), WEIGHTS["MEDIUM"])
        floor = w["floor"]

        # 3. Compute weighted score per carrier and split eligible / excluded
        # Normalize cost: 0=cheapest, 1=most expensive (lower=better)
        rates = [dict(r) for r in rates]
        min_rate = min(r["base_rate"] for r in rates)
        max_rate = max(r["base_rate"] for r in rates)
        rate_range = max_rate - min_rate if max_rate > min_rate else 1
        # Normalize composite: 0..100 → 0..1
        for r in rates:
            r["norm_cost"] = (r["base_rate"] - min_rate) / rate_range  # 0=cheap, 1=expensive
            r["norm_composite"] = (r["composite_score"] or 0) / 100.0
            # weighted_score: higher = better
            r["weighted_score"] = (
                w["composite"] * r["norm_composite"]
                + w["cost"] * (1 - r["norm_cost"])
            )

        eligible = []
        excluded = []
        for r in rates:
            comp = r["composite_score"] or 0
            if floor is not None and comp < floor:
                excluded.append({
                    "carrier_name": r["carrier_name"],
                    "carrier_type": r["carrier_type"],
                    "base_rate": r["base_rate"],
                    "composite_score": comp,
                    "exclusion_reason": (
                        f"Excluded — composite {comp:.0f} < {criticality.upper()} threshold "
                        f"{floor:.0f}."
                    ),
                })
            else:
                cap = capacities.get(r["carrier_name"], None)
                eligible.append({
                    "carrier_name": r["carrier_name"],
                    "carrier_type": r["carrier_type"],
                    "base_rate": r["base_rate"],
                    "composite_score": comp,
                    "capacity_available": cap,
                    "tier": r["tier"],
                    "weighted_score": round(r["weighted_score"], 3),
                    "rationale": _rationale(r, criticality),
                    "is_recommended": False,
                })

        # Sort eligible by weighted_score desc
        eligible.sort(key=lambda x: -x["weighted_score"])
        if eligible:
            eligible[0]["is_recommended"] = True

        return {
            "lane": f"{origin} → {destination}",
            "criticality": criticality.upper(),
            "weighting": w,
            "eligible": eligible,
            "excluded": excluded,
        }
    finally:
        conn.close()


def _rationale(rate, criticality):
    tier = rate.get("tier") or ""
    comp = rate.get("composite_score") or 0
    if tier == "Primary":
        return f"Primary contract carrier; scorecard {comp:.0f}"
    if tier == "Backup":
        return f"Backup capacity; scorecard {comp:.0f}"
    if tier == "Spot":
        return f"Premium / spot tier; scorecard {comp:.0f}"
    return f"Scorecard {comp:.0f}"


if __name__ == "__main__":
    import json
    result = rank_carriers(
        origin="Long Beach — Pier T",
        destination="NewAge Perris CA",
        equipment="40HC",
        criticality="HIGH",
    )
    print("Lane:", result["lane"], "(criticality:", result["criticality"] + ")")
    print()
    print("Eligible carriers:")
    for r in result["eligible"]:
        rec = " RECOMMENDED" if r["is_recommended"] else ""
        print(f"  ${r['base_rate']:.0f}  composite {r['composite_score']:.0f}  "
              f"{r['carrier_name']}  ({r['carrier_type']}){rec}")
    print()
    print("Excluded:")
    for r in result["excluded"]:
        print(f"  ${r['base_rate']:.0f}  composite {r['composite_score']:.0f}  "
              f"{r['carrier_name']}  → {r['exclusion_reason']}")
