"""
Generate mock test invoices for Maverick upload flow demos.
Creates 2 PDFs (PCD drayage + CDS drayage) and 1 Excel — all with
brand-new invoice numbers so they bubble to the top of the table
(JUST_UPLOADED set) and don't collide with seed data.

Run from inside maverick_backend/:
    python3 test_invoices/_generate.py
"""
import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether,
)
from openpyxl import Workbook

HERE = os.path.dirname(os.path.abspath(__file__))


def _styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle(name="H1Big", fontName="Helvetica-Bold", fontSize=14, spaceAfter=6))
    s.add(ParagraphStyle(name="Small", fontName="Helvetica", fontSize=8, leading=10))
    s.add(ParagraphStyle(name="SmallB", fontName="Helvetica-Bold", fontSize=8, leading=10))
    return s


def _build_pdf(path, header_company, header_addr, header_contact, invoice_no,
               invoice_date, terms, fb_no, container_no, bol, origin, dest, equip,
               linehaul, fsc_pct, fsc_amount, accessorials, grand_total, msa_ref):
    doc = SimpleDocTemplate(
        path, pagesize=LETTER,
        leftMargin=0.5 * inch, rightMargin=0.5 * inch,
        topMargin=0.5 * inch, bottomMargin=0.5 * inch,
    )
    s = _styles()
    story = []

    story.append(Paragraph(f"<b>{header_company}</b>  ·  Invoice {invoice_no}", s["Small"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"<b>{header_company}</b>", s["H1Big"]))

    meta = [
        ["INVOICE #", invoice_no, "Invoice Date", invoice_date],
        ["", "", "Shipment Date", invoice_date],
        ["", "", "Terms", terms],
    ]
    t = Table(meta, colWidths=[1.1 * inch, 2.2 * inch, 1.1 * inch, 2.2 * inch])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (0, 0), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.grey),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(t)
    story.append(Spacer(1, 6))
    story.append(Paragraph(header_addr, s["Small"]))
    story.append(Paragraph(header_contact, s["Small"]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("<b>BILL TO</b>", s["SmallB"]))
    story.append(Paragraph("NewAge Products Logistics California Inc.", s["Small"]))
    story.append(Paragraph("3125 Wilson Ave, Perris, CA 92571", s["Small"]))
    story.append(Paragraph("AP: ap.usa@newageproducts.com · ATTN: Inbound Freight", s["Small"]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("<b>LOAD DETAILS</b>", s["SmallB"]))
    story.append(Paragraph(f"FB# / Load ID: {fb_no}", s["Small"]))
    story.append(Paragraph(f"Container #: {container_no}", s["Small"]))
    story.append(Paragraph(f"BOL / MBL: {bol}", s["Small"]))
    story.append(Paragraph(f"Equipment: {equip}", s["Small"]))
    story.append(Paragraph(f"Origin: {origin}", s["Small"]))
    story.append(Paragraph(f"Destination: {dest}", s["Small"]))
    story.append(Spacer(1, 8))

    # Line table — extractor finds the table whose first header cell is "#"
    fsc_amt_str = f"{fsc_amount:.2f}"
    linehaul_str = f"{linehaul:.2f}"
    shipment_amt = round(linehaul + fsc_amount, 2)
    rows = [
        ["#", "Type", "Description", "Qty", "Rate (USD)", "Linehaul\n(USD)", "FSC %", "FSC\n(USD)", "Amount\n(USD)"],
        ["1", "Shipment", "Linehaul (P&D) + Fuel Surcharge", "1",
         linehaul_str, linehaul_str, f"{int(fsc_pct * 100)}%", fsc_amt_str, f"{shipment_amt:.2f}"],
    ]
    n = 2
    for desc, amt in accessorials:
        rows.append([str(n), "Accessorial", desc, "1", f"{amt:.2f}", "—", "—", "—", f"{amt:.2f}"])
        n += 1
    line_tbl = Table(rows, colWidths=[0.3 * inch, 0.75 * inch, 2.0 * inch, 0.4 * inch,
                                      0.75 * inch, 0.75 * inch, 0.45 * inch, 0.6 * inch, 0.75 * inch])
    line_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaeaea")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(line_tbl)
    story.append(Spacer(1, 6))

    accessorials_sum = sum(a[1] for a in accessorials)
    summary = [
        ["Linehaul subtotal", f"${linehaul:.2f}"],
        ["FSC subtotal", f"${fsc_amount:.2f}"],
        ["Accessorials subtotal", f"${accessorials_sum:.2f}"],
        ["GRAND TOTAL (USD)", f"${grand_total:.2f}"],
    ]
    sum_tbl = Table(summary, colWidths=[2.5 * inch, 1.2 * inch], hAlign="RIGHT")
    sum_tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.75, colors.black),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(sum_tbl)
    story.append(Spacer(1, 6))
    story.append(Paragraph("(US drayage — no sales tax on freight services)", s["Small"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>REMIT TO</b>", s["SmallB"]))
    story.append(Paragraph(f"{header_company} · Wells Fargo Bank · Acct ending 7401 · Routing 121000248", s["Small"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"Disputes within 30 days per MSA {msa_ref} §7.2. Late payments accrue 1.5% per month.",
        s["Small"]))

    doc.build(story)
    print(f"  wrote {os.path.basename(path)}")


def _build_customs_pdf(path, invoice_no, invoice_date, period, terms, entries, grand_total):
    """Customs broker invoice (Livingston-style). PDF text includes entry #s,
    container links, HTS, duty stack — same extractor reads it; backend audit
    fires when grand_total > $50k."""
    doc = SimpleDocTemplate(
        path, pagesize=LETTER,
        leftMargin=0.45 * inch, rightMargin=0.45 * inch,
        topMargin=0.5 * inch, bottomMargin=0.5 * inch,
    )
    s = _styles()
    story = []
    header = "LIVINGSTON INTERNATIONAL"
    story.append(Paragraph(f"<b>{header}</b>  ·  Invoice {invoice_no}", s["Small"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"<b>{header} — U.S. Broker Invoice</b>", s["H1Big"]))

    meta = [
        ["INVOICE #", invoice_no, "Invoice Date", invoice_date],
        ["", "", "Period", period],
        ["", "", "Terms", terms],
    ]
    t = Table(meta, colWidths=[1.1 * inch, 2.2 * inch, 1.1 * inch, 2.5 * inch])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (0, 0), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.grey),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(t)
    story.append(Spacer(1, 6))
    story.append(Paragraph("1140 Spruce St, Trenton, NJ 08648 · AP@livingstonintl.com · Filer Code 8869", s["Small"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>BILL TO / IMPORTER OF RECORD</b>", s["SmallB"]))
    story.append(Paragraph("NewAge Products USA, Inc. · EIN 47-1820392", s["Small"]))
    story.append(Paragraph("3125 Wilson Ave, Perris, CA 92571 · AP: ap.usa@newageproducts.com", s["Small"]))
    story.append(Spacer(1, 10))

    # Entries table — header starts with "#" so pdfplumber.extract_tables picks it up
    rows = [["#", "Entry #", "Container", "PO", "Entered Value", "HTS Code",
             "Duty Rate", "Sec 301", "Sec 232", "Duty", "MPF", "HMF", "Brokerage", "Subtotal"]]
    for i, e in enumerate(entries, 1):
        subtotal = round(e["duty"] + e["mpf"] + e["hmf"] + e["brokerage"] + e["disbursement"] + e["isf"], 2)
        rows.append([
            str(i), e["entry"], e["container"], e["po"],
            f"${e['value']:.2f}", e["hts"], e["duty_rate"], e["sec301"], e["sec232"],
            f"${e['duty']:.2f}", f"${e['mpf']:.2f}", f"${e['hmf']:.2f}",
            f"${e['brokerage']:.2f}", f"${subtotal:.2f}",
        ])
    line_tbl = Table(rows, colWidths=[0.25, 0.6, 0.7, 0.7, 0.7, 0.65, 0.5, 0.4, 0.4, 0.6, 0.45, 0.45, 0.55, 0.65])
    # convert to inch-friendly widths
    line_tbl._argW = [w * inch for w in line_tbl._argW]
    line_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 6.5),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaeaea")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(line_tbl)
    story.append(Spacer(1, 8))

    duty_sum = sum(e["duty"] for e in entries)
    summary = [
        ["Total Duty", f"${duty_sum:.2f}"],
        ["MPF + HMF", f"${sum(e['mpf'] + e['hmf'] for e in entries):.2f}"],
        ["Brokerage + disbursement + ISF", f"${sum(e['brokerage'] + e['disbursement'] + e['isf'] for e in entries):.2f}"],
        ["GRAND TOTAL (USD)", f"${grand_total:.2f}"],
    ]
    sum_tbl = Table(summary, colWidths=[2.8 * inch, 1.2 * inch], hAlign="RIGHT")
    sum_tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.75, colors.black),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(sum_tbl)
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "Per CBP Form 7501. Section 301 (China-origin) and Section 232 stack atop HTS base rate. "
        "Disputes within 30 days per broker MSA §6.4.", s["Small"]))

    doc.build(story)
    print(f"  wrote {os.path.basename(path)}")


def _build_excel(path, rows):
    """Single-sheet flat invoice list — same shape Maverick's _extract_from_excel reads."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Invoices"
    headers = [
        "Invoice #", "Invoice Date", "Carrier", "FB# / Load ID", "Container #",
        "BOL/MBL #", "Equipment", "Origin", "Destination",
        "Rate Type", "Base Rate", "Linehaul (USD)", "FSC %", "FSC (USD)",
        "Accessorial Detail", "Grand Total (USD)", "Currency", "Terms",
    ]
    ws.append(headers)
    for r in rows:
        ws.append([r.get(h, "") for h in headers])
    wb.save(path)
    print(f"  wrote {os.path.basename(path)}")


def main():
    print("Generating Maverick mock test invoices...")

    # Test #1: PCD drayage — LB Pier T → Perris CA, HIGH lane, container new
    _build_pdf(
        path=os.path.join(HERE, "TEST_PCD-INV-99001.pdf"),
        header_company="PACIFIC COASTLINE DRAYAGE INC.",
        header_addr="2200 E. Anaheim Street, Long Beach, CA 90804",
        header_contact="Tel (562) 555-0190 · AP@pacificcoastlinedrayage.com · EIN 95-4827193",
        invoice_no="PCD-INV-99001",
        invoice_date="2026-05-18",
        terms="Net 30",
        fb_no="PCD25051801",
        container_no="ONEU8901234",
        bol="ONEYSZPG60270001",
        origin="Long Beach — Pier T",
        dest="NewAge Perris CA",
        equip="40HC",
        linehaul=495.00,
        fsc_pct=0.22,
        fsc_amount=108.90,
        accessorials=[("Pier Pass / Clean Truck Fee", 30.00)],
        grand_total=633.90,
        msa_ref="PCD-NA-MSA-2025-014",
    )

    # Test #2: CDS drayage — Savannah → Monee IL (will trigger different lane)
    _build_pdf(
        path=os.path.join(HERE, "TEST_CDS-INV-99001.pdf"),
        header_company="CONTINENTAL DRAYAGE SOLUTIONS",
        header_addr="980 Industrial Pkwy, Savannah, GA 31408",
        header_contact="Tel (912) 555-0181 · AP@continentaldrayage.com · EIN 58-1820439",
        invoice_no="CDS-INV-99001",
        invoice_date="2026-05-18",
        terms="Net 45",
        fb_no="CDS25051801",
        container_no="MSCU7708219",
        bol="MEDUSV80290001",
        origin="Savannah — Garden City Terminal",
        dest="NewAge Monee IL",
        equip="40HC",
        linehaul=1450.00,
        fsc_pct=0.18,
        fsc_amount=261.00,
        accessorials=[
            ("Chassis Day x 3", 90.00),
            ("Pre-pull / Storage", 175.00),  # ⚠ planted: should trigger pre-pull audit
        ],
        grand_total=1976.00,
        msa_ref="CDS-NA-MSA-2025-009",
    )

    # Test #3: Customs broker invoice (Livingston) — high-duty entry to trigger audit
    _build_customs_pdf(
        path=os.path.join(HERE, "TEST_LI-99001_customs.pdf"),
        invoice_no="LI-99001",
        invoice_date="2026-05-18",
        period="2026-05-01 to 2026-05-18",
        terms="Net 30",
        entries=[
            {
                "entry": "LI-99001-A",
                "container": "ONEU8901234",
                "po": "PO-NA-25-04481",
                "value": 184500.00,
                "hts": "9403.20.0090",
                "duty_rate": "0.0%",
                "sec301": "25%",
                "sec232": "—",
                "duty": 46125.00,
                "mpf": 538.40,
                "hmf": 235.34,
                "brokerage": 285.00,
                "disbursement": 95.00,
                "isf": 35.00,
            },
            {
                "entry": "LI-99001-B",
                "container": "MSCU7708219",
                "po": "PO-NA-25-04492",
                "value": 22400.00,
                "hts": "7321.11.6000",
                "duty_rate": "5.7%",
                "sec301": "25%",
                "sec232": "—",
                "duty": 6877.20,
                "mpf": 78.40,
                "hmf": 28.56,
                "brokerage": 175.00,
                "disbursement": 65.00,
                "isf": 35.00,
            },
        ],
        grand_total=54571.50,  # > $50k → triggers duty_math_check audit
    )

    # Test #4: Excel — two invoices in one file, including an ACS lane
    _build_excel(
        path=os.path.join(HERE, "TEST_Bulk_Invoices.xlsx"),
        rows=[
            {
                "Invoice #": "ACS-INV-99001",
                "Invoice Date": "2026-05-17",
                "Carrier": "Atlantic Container Services",
                "FB# / Load ID": "ACS25051701",
                "Container #": "HLBU4421890",
                "BOL/MBL #": "HLCUEC123456",
                "Equipment": "40HC",
                "Origin": "Charleston — Wando Welch",
                "Destination": "NewAge Monee IL",
                "Rate Type": "DRY",
                "Base Rate": 1320.00,
                "Linehaul (USD)": 1320.00,
                "FSC %": 0.18,
                "FSC (USD)": 237.60,
                "Accessorial Detail": "Chassis day x 2",
                "Grand Total (USD)": 1617.60,
                "Currency": "USD",
                "Terms": "Net 30",
            },
            {
                "Invoice #": "PCD-INV-99002",
                "Invoice Date": "2026-05-17",
                "Carrier": "Pacific Coastline Drayage",
                "FB# / Load ID": "PCD25051702",
                "Container #": "OOLU9912345",
                "BOL/MBL #": "OOLU2050001234",
                "Equipment": "40HC",
                "Origin": "Long Beach — Pier T",
                "Destination": "NewAge Perris CA",
                "Rate Type": "DRY",
                "Base Rate": 495.00,
                "Linehaul (USD)": 495.00,
                "FSC %": 0.22,
                "FSC (USD)": 108.90,
                "Accessorial Detail": "Pier Pass; Chassis day",
                "Grand Total (USD)": 663.90,
                "Currency": "USD",
                "Terms": "Net 30",
            },
        ],
    )

    print("Done.")


if __name__ == "__main__":
    main()
