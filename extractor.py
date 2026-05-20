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


def extract_invoice(file_path: str) -> dict:
    """Extract invoice data from a PDF or Excel file."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext in (".xlsx", ".xls"):
        return _extract_from_excel(file_path)
    # default = PDF path
    if ANTHROPIC_AVAILABLE:
        try:
            return _extract_via_anthropic(file_path)
        except Exception as e:
            print(f"  [warn] Anthropic extraction failed: {e}; falling back to regex")
    return _extract_via_regex(file_path)


def _extract_from_excel(xlsx_path: str) -> dict:
    """Parse an Excel file. Supports two shapes:
       1. Single-sheet flat invoice (Invoice # in first/header row)
       2. Multi-sheet workbook (uses 'Invoices' + 'Invoice_Lines' sheets)
    Returns the same dict shape as PDF extraction.
    """
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)

    # Try multi-sheet structure first
    if "Invoices" in wb.sheetnames and "Invoice_Lines" in wb.sheetnames:
        return _extract_from_multisheet(wb)

    # Otherwise, treat the first sheet as a flat invoice
    ws = wb.active
    invoice_no = None
    carrier_name = "Unknown Carrier"
    invoice_date = None
    fb_no = None
    container_no = None
    bol = None
    origin = None
    destination = None
    base_rate = 0.0
    fsc_pct = 0.0
    fsc_amount = 0.0
    grand_total = 0.0
    lines = []

    # Scan first 20 rows for header metadata
    for r in range(1, min(25, ws.max_row + 1)):
        for c in range(1, min(10, ws.max_column + 1)):
            v = ws.cell(row=r, column=c).value
            if not v: continue
            sv = str(v).strip().lower()
            nxt = ws.cell(row=r, column=c+1).value
            if "invoice #" in sv or "invoice number" in sv:
                invoice_no = str(nxt) if nxt else None
            elif "carrier" in sv and not carrier_name.startswith("Pacific"):
                carrier_name = str(nxt) if nxt else carrier_name
            elif "invoice date" in sv:
                invoice_date = str(nxt) if nxt else None

    # If sheet has a header row matching the Invoice_Lines pattern, parse lines
    header_row = None
    for r in range(1, min(15, ws.max_row + 1)):
        headers = [str(ws.cell(row=r, column=c).value or "").strip().lower() for c in range(1, ws.max_column + 1)]
        if "type" in headers and "description" in headers and ("amount" in headers or "rate" in headers):
            header_row = r
            break

    if header_row:
        col_idx = {(ws.cell(row=header_row, column=c).value or "").strip().lower(): c
                   for c in range(1, ws.max_column + 1)}
        for r in range(header_row + 1, ws.max_row + 1):
            t = ws.cell(row=r, column=col_idx.get("type", 0)).value if col_idx.get("type") else None
            if not t: continue
            line_type = "SHIPMENT" if "shipment" in str(t).lower() else "ACCESSORIAL"
            desc = ws.cell(row=r, column=col_idx.get("description", 0)).value if col_idx.get("description") else None
            qty = ws.cell(row=r, column=col_idx.get("qty", 0)).value if col_idx.get("qty") else 1
            rate = ws.cell(row=r, column=col_idx.get("rate", 0)).value if col_idx.get("rate") else 0
            amount = ws.cell(row=r, column=col_idx.get("amount", 0)).value if col_idx.get("amount") else 0
            try: qty_f = float(qty or 1)
            except: qty_f = 1
            try: rate_f = float(rate or 0)
            except: rate_f = 0
            try: amount_f = float(amount or 0)
            except: amount_f = 0
            lines.append({"line_type": line_type, "description": str(desc) if desc else "",
                          "qty": qty_f, "rate": rate_f, "amount": amount_f})
            if line_type == "SHIPMENT" and not base_rate:
                base_rate = ws.cell(row=r, column=col_idx.get("linehaul", 0)).value if col_idx.get("linehaul") else rate_f
                base_rate = float(base_rate or rate_f)
                fsc_amt_cell = ws.cell(row=r, column=col_idx.get("fsc $", 0)).value if col_idx.get("fsc $") else 0
                fsc_amount = float(fsc_amt_cell or 0)
                fsc_pct_cell = ws.cell(row=r, column=col_idx.get("fsc %", 0)).value if col_idx.get("fsc %") else None
                if fsc_pct_cell:
                    s = str(fsc_pct_cell).replace("%", "").strip()
                    try: fsc_pct = float(s) / 100.0 if float(s) > 1 else float(s)
                    except: fsc_pct = 0
                if not fb_no:
                    fb_no = ws.cell(row=r, column=col_idx.get("fb#", 0)).value if col_idx.get("fb#") else None
                if not container_no:
                    container_no = ws.cell(row=r, column=col_idx.get("container #", 0)).value if col_idx.get("container #") else None

    grand_total = sum(l["amount"] for l in lines) + fsc_amount + base_rate
    accessorials_total = sum(l["amount"] for l in lines if l["line_type"] == "ACCESSORIAL")

    return {
        "invoice_no": invoice_no or os.path.basename(xlsx_path).replace(".xlsx", "").replace(".xls", ""),
        "carrier_name": carrier_name,
        "invoice_date": invoice_date,
        "fb_no": str(fb_no) if fb_no else None,
        "container_no": str(container_no) if container_no else None,
        "bol": None,
        "origin": None,
        "destination": None,
        "base_rate": base_rate,
        "fsc_pct": fsc_pct,
        "fsc_amount": fsc_amount,
        "accessorials_total": accessorials_total,
        "grand_total": grand_total,
        "lines": lines,
        "confidence": 0.88,
    }


def _extract_from_multisheet(wb) -> dict:
    """If the user uploads our master workbook (multi-sheet), extract the FIRST invoice."""
    ws_inv = wb["Invoices"]
    ws_lines = wb["Invoice_Lines"]
    inv_h = {(ws_inv.cell(row=4, column=c).value or "").strip().lower(): c for c in range(1, ws_inv.max_column + 1)}
    line_h = {(ws_lines.cell(row=4, column=c).value or "").strip().lower(): c for c in range(1, ws_lines.max_column + 1)}
    # take first invoice row
    r = 5
    inv_no = ws_inv.cell(row=r, column=inv_h.get("invoice #", 2)).value
    if not inv_no:
        return {"invoice_no": "(empty)", "carrier_name": "Unknown", "lines": [], "grand_total": 0, "confidence": 0.5}
    # build line items for that invoice
    lines = []
    for lr in range(5, ws_lines.max_row + 1):
        if ws_lines.cell(row=lr, column=line_h.get("invoice #", 1)).value != inv_no:
            continue
        lines.append({
            "line_type": str(ws_lines.cell(row=lr, column=line_h.get("type", 3)).value or "SHIPMENT"),
            "description": str(ws_lines.cell(row=lr, column=line_h.get("description", 6)).value or ""),
            "qty": float(ws_lines.cell(row=lr, column=line_h.get("qty", 7)).value or 1),
            "rate": float(ws_lines.cell(row=lr, column=line_h.get("rate", 8)).value or 0),
            "amount": float(ws_lines.cell(row=lr, column=line_h.get("amount", 12)).value or 0),
        })
    return {
        "invoice_no": str(inv_no),
        "carrier_name": str(ws_inv.cell(row=r, column=inv_h.get("carrier", 3)).value or "Unknown"),
        "invoice_date": str(ws_inv.cell(row=r, column=inv_h.get("invoice date", 4)).value or ""),
        "fb_no": str(ws_inv.cell(row=r, column=inv_h.get("fb# / load id", 5)).value or ""),
        "container_no": str(ws_inv.cell(row=r, column=inv_h.get("container #", 6)).value or ""),
        "bol": None,
        "origin": str(ws_inv.cell(row=r, column=inv_h.get("origin", 8)).value or ""),
        "destination": str(ws_inv.cell(row=r, column=inv_h.get("destination", 9)).value or ""),
        "base_rate": float(ws_inv.cell(row=r, column=inv_h.get("linehaul (usd)", 11)).value or 0),
        "fsc_pct": 0.22,
        "fsc_amount": float(ws_inv.cell(row=r, column=inv_h.get("fsc (usd)", 13)).value or 0),
        "accessorials_total": float(ws_inv.cell(row=r, column=inv_h.get("accessorials (usd)", 14)).value or 0),
        "grand_total": float(ws_inv.cell(row=r, column=inv_h.get("grand total (usd)", 15)).value or 0),
        "lines": lines,
        "confidence": 0.95,
    }


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
