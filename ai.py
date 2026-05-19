"""AI wrapper — Anthropic Sonnet/Haiku with deterministic fallback templates.

Three surfaces:
  - summarize_exceptions(exceptions) → 5-bullet plain-English roll-up
  - draft_email(template_type, context) → {to, subject, body}
  - draft_dispute(invoice, exception) → dispute email body

When ANTHROPIC_API_KEY is set, uses the LLM. Otherwise falls back to templates.
"""
import os

ANTHROPIC_AVAILABLE = bool(os.environ.get("ANTHROPIC_API_KEY"))


def summarize_exceptions(exceptions: list) -> str:
    """5-bullet roll-up across all open audit exceptions."""
    if not exceptions:
        return "No open audit exceptions. Inbox is clean."

    if ANTHROPIC_AVAILABLE:
        try:
            return _summarize_via_anthropic(exceptions)
        except Exception as e:
            print(f"  [warn] AI summary failed: {e}; using template")

    return _summarize_template(exceptions)


def _summarize_template(exceptions: list) -> str:
    total = sum(e.get("dollars_at_risk", 0) or 0 for e in exceptions)
    by_rule = {}
    by_severity = {}
    for e in exceptions:
        by_rule[e["rule_family"]] = by_rule.get(e["rule_family"], 0) + 1
        by_severity[e["severity"]] = by_severity.get(e["severity"], 0) + 1

    sorted_by_dollar = sorted(exceptions, key=lambda x: -(x.get("dollars_at_risk") or 0))[:3]
    top_three = ", ".join(
        f"{e['rule_family']} ${e.get('dollars_at_risk') or 0:,.0f} ({e.get('source_ref','')})"
        for e in sorted_by_dollar
    )

    crit = by_severity.get("CRITICAL", 0)
    high = by_severity.get("HIGH", 0)

    bullets = [
        f"Total at risk: ${total:,.2f} across {len(exceptions)} open exceptions.",
        f"Severity mix: {crit} CRITICAL, {high} HIGH, "
        f"{by_severity.get('MEDIUM',0)} MEDIUM, {by_severity.get('LOW',0)} LOW.",
        f"Top three by dollar: {top_three}.",
        f"Rule mix: {', '.join(f'{k}: {v}' for k,v in sorted(by_rule.items(), key=lambda x:-x[1])[:4])}.",
        ("Recommend: hold payment on CRITICAL findings, dispute MEDIUM/HIGH within 30-day "
         "MSA window."),
    ]
    return "\n".join(f"• {b}" for b in bullets)


def _summarize_via_anthropic(exceptions: list) -> str:
    import anthropic
    client = anthropic.Anthropic()
    prompt = (
        "You are an inbound freight ops analyst writing a 5-bullet roll-up for "
        "the IFM's morning dashboard. Summarize these audit exceptions in plain "
        "English. Lead with total $ at risk. Name the top three findings by "
        "dollar. End with a recommended next step. Use bullets prefixed with '•'.\n\n"
        f"Exceptions:\n{exceptions}"
    )
    response = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


def draft_email(template_type: str, context: dict) -> dict:
    """Generate an email draft for the various dispatch/dispute/RFQ flows."""
    if ANTHROPIC_AVAILABLE:
        try:
            return _draft_email_via_anthropic(template_type, context)
        except Exception as e:
            print(f"  [warn] AI email failed: {e}; using template")
    return _draft_email_template(template_type, context)


def _draft_email_template(template_type: str, context: dict) -> dict:
    """Deterministic email drafts. context is a dict with the relevant fields."""
    carrier = context.get("carrier_name", "Carrier Dispatch")
    carrier_slug = "".join(c.lower() for c in carrier if c.isalpha())
    to = context.get("to", f"dispatch@{carrier_slug}.com")

    if template_type == "dispatch_instruction":
        container = context.get("container_no", "(container)")
        load_id = context.get("fb_no", "(load)")
        window = context.get("pickup_window", "the next 24 hours")
        reason = context.get("reason", "Container ready for pickup")
        terminal = context.get("terminal", "(terminal)")
        return {
            "to": to,
            "subject": f"Dispatch Instruction — Load {load_id} — Container {container}",
            "body": (
                f"Hi {carrier} dispatch,\n\n"
                f"Please dispatch container {container} from {terminal} within {window}.\n\n"
                f"Load ID: {load_id}\n"
                f"Requested window: {window}\n"
                f"Reason: {reason}\n\n"
                "If you cannot meet this window, reply within 2 hours so we can re-route.\n\n"
                "Thanks,\n"
                "James Tran\n"
                "Inbound Freight Manager, NewAge Products\n"
                "james.tran@newageproducts.com"
            ),
        }

    if template_type == "batch_dispatch":
        loads = context.get("loads", [])
        load_lines = "\n".join(
            f"  - Container {l.get('container_no','')}, Load {l.get('fb_no','')}, "
            f"Origin: {l.get('origin','')}"
            for l in loads
        )
        return {
            "to": to,
            "subject": f"Batch Dispatch Instruction — {len(loads)} loads ready",
            "body": (
                f"Hi {carrier} dispatch,\n\n"
                f"The following {len(loads)} containers are out-gate ready and need "
                "dispatch in the next 24 hours:\n\n"
                f"{load_lines}\n\n"
                "Please confirm pickup times by EOD. If any can't be picked up within "
                "free time, flag immediately and we'll re-route to backup carrier.\n\n"
                "Thanks,\n"
                "James Tran\n"
                "Inbound Freight Manager, NewAge Products"
            ),
        }

    if template_type == "prearrival_forecast":
        loads = context.get("loads", [])
        load_lines = "\n".join(
            f"  - {l.get('vessel','')}: container {l.get('container_no','')}, "
            f"ETA {l.get('eta','')}, terminal {l.get('terminal','')}, "
            f"destination {l.get('destination','')}"
            for l in loads
        )
        week = context.get("week", "the coming week")
        return {
            "to": to,
            "subject": f"Pre-Arrival Forecast — {week} — {len(loads)} containers expected",
            "body": (
                f"Hi {carrier} dispatch,\n\n"
                f"Our forecast for {week}: {len(loads)} containers expected to land at "
                "the following terminals.\n\n"
                f"{load_lines}\n\n"
                "Please confirm capacity availability for the lane volume above. "
                "We'll send a refined list 48 hours before each vessel discharge.\n\n"
                "Thanks,\n"
                "James Tran\n"
                "Inbound Freight Manager, NewAge Products"
            ),
        }

    if template_type == "dispute":
        invoice_no = context.get("invoice_no", "(invoice)")
        finding = context.get("finding", "an audit exception")
        amount = context.get("dollars_at_risk", 0)
        description = context.get("description", "")
        return {
            "to": to,
            "subject": f"DISPUTE — Invoice {invoice_no} — ${amount:,.2f}",
            "body": (
                f"Hi {carrier} accounts receivable,\n\n"
                f"On invoice {invoice_no}, we have identified the following discrepancy "
                f"({finding}):\n\n"
                f"{description}\n\n"
                f"Disputed amount: ${amount:,.2f}.\n\n"
                "Per MSA §7.2, we are filing this dispute within the 30-day window. "
                "Please credit the disputed amount in our next statement and confirm "
                "by reply within 5 business days.\n\n"
                "Thanks,\n"
                "James Tran\n"
                "Inbound Freight Manager, NewAge Products"
            ),
        }

    if template_type == "rfq":
        lane = context.get("lane", "(lane)")
        equipment = context.get("equipment", "40HC")
        volume = context.get("volume", "~5 containers/week")
        return {
            "to": to,
            "subject": f"RFQ — {lane} — {equipment}",
            "body": (
                f"Hi {carrier} sales,\n\n"
                f"We are evaluating rates for the {lane} lane on {equipment} equipment. "
                f"Estimated volume: {volume}.\n\n"
                "Please quote your base rate, FSC%, accessorial schedule, and weekly "
                "capacity. Response deadline: 5 business days.\n\n"
                "Thanks,\n"
                "James Tran\n"
                "Inbound Freight Manager, NewAge Products"
            ),
        }

    # default
    return {"to": to, "subject": "(no template)", "body": "(no body)"}


def _draft_email_via_anthropic(template_type: str, context: dict) -> dict:
    """Use Claude Sonnet to draft a more nuanced version of the email."""
    import anthropic
    client = anthropic.Anthropic()
    fallback = _draft_email_template(template_type, context)
    prompt = (
        f"You are James Tran, Inbound Freight Manager at NewAge Products. "
        f"Draft a {template_type.replace('_',' ')} email based on the context below. "
        f"Keep it professional, concise, action-oriented. Include subject and body. "
        f"Use the deterministic version as a starting point but improve clarity and tone.\n\n"
        f"Context: {context}\n\n"
        f"Deterministic baseline:\n"
        f"Subject: {fallback['subject']}\n"
        f"Body:\n{fallback['body']}\n\n"
        "Return ONLY two fields, separated by a single line containing '---BODY---':\n"
        "Subject: <subject line>\n"
        "---BODY---\n"
        "<email body>"
    )
    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text
    if "---BODY---" not in text:
        return fallback
    parts = text.split("---BODY---", 1)
    subject_line = parts[0].strip()
    if subject_line.lower().startswith("subject:"):
        subject_line = subject_line[len("subject:"):].strip()
    return {
        "to": fallback["to"],
        "subject": subject_line,
        "body": parts[1].strip(),
    }
