"""Varied-layout invoice generator — stresses the extractor.

Produces 6 PDFs (4 drayage + 2 customs) with distinctly different layouts to
exercise the regex/heuristic parser:

  variety_v1_maersk_logistics.pdf   — field-style header, narrative line items
  variety_v2_pcd_express.pdf        — compact table, mm/dd/yyyy date, "Total" label
  variety_v3_atlantic_oneliner.pdf  — labels with colons (Ref:, Container:), Balance Due
  variety_v4_continental_bol.pdf    — Equipment Number / BOL-MAWB labels, 2-digit year
  variety_v5_customs_alt_broker.pdf — non-Livingston broker, different table column order
  variety_v6_demurrage_invoice.pdf  — per-diem table, container at top, AMOUNT DUE

Each generator returns (pdf_path, expected_fields_dict) for the test harness.
"""
import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)

HERE = os.path.dirname(os.path.abspath(__file__))


def _styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle(name="H1", fontName="Helvetica-Bold", fontSize=14, spaceAfter=8))
    s.add(ParagraphStyle(name="H2", fontName="Helvetica-Bold", fontSize=11, spaceAfter=4))
    s.add(ParagraphStyle(name="Body", fontName="Helvetica", fontSize=9, leading=12))
    s.add(ParagraphStyle(name="BodyB", fontName="Helvetica-Bold", fontSize=9, leading=12))
    s.add(ParagraphStyle(name="Mono", fontName="Courier", fontSize=9, leading=12))
    return s


# =========================================================================
# Variant 1 — Maersk Logistics: field-style header, narrative line items
# =========================================================================
def variety_v1_maersk_logistics():
    s = _styles()
    path = os.path.join(HERE, "variety_v1_maersk_logistics.pdf")
    doc = SimpleDocTemplate(path, pagesize=LETTER, leftMargin=0.5*inch, rightMargin=0.5*inch,
                            topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    story.append(Paragraph("<b>Maersk Logistics North America</b>", s["H1"]))
    story.append(Paragraph("180 Park Avenue · Florham Park NJ 07932 · ar@maersklogistics.us", s["Body"]))
    story.append(Spacer(1, 10))

    # Field-style header — no table for invoice meta
    story.append(Paragraph("INVOICE", s["H2"]))
    story.append(Paragraph("Invoice Number: <b>MAEU-2026-W21-08841</b>", s["Body"]))
    story.append(Paragraph("Invoice Date: <b>May 19, 2026</b>", s["Body"]))
    story.append(Paragraph("Terms: NET 30", s["Body"]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("<b>Shipment Reference</b>", s["BodyB"]))
    story.append(Paragraph("Reference No.: MAERSK-DRAY-088410", s["Body"]))
    story.append(Paragraph("Equipment ID: MSKU8821453", s["Body"]))
    story.append(Paragraph("B/L Number: MAEU142719318", s["Body"]))
    story.append(Paragraph("Pickup: Long Beach Terminal Pier T (ITS)", s["Body"]))
    story.append(Paragraph("Delivery: NewAge Products DC - Perris, CA", s["Body"]))
    story.append(Spacer(1, 12))

    # Narrative line items
    story.append(Paragraph("<b>Charges</b>", s["BodyB"]))
    story.append(Paragraph("Linehaul (drayage Long Beach → Perris): $495.00", s["Body"]))
    story.append(Paragraph("Fuel Surcharge (22% of linehaul): $108.90", s["Body"]))
    story.append(Paragraph("Chassis Split: $30.00", s["Body"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>TOTAL AMOUNT DUE: $633.90</b>", s["H2"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Remit per MSA §4.1. Payment terms NET 30. Questions: ar@maersklogistics.us", s["Body"]))

    doc.build(story)
    return path, {
        "invoice_no": "MAEU-2026-W21-08841",
        "carrier_name_contains": "Maersk",
        "invoice_date": "2026-05-19",
        "fb_no": "MAERSK-DRAY-088410",
        "container_no": "MSKU8821453",
        "bol": "MAEU142719318",
        "origin_contains": "Long Beach",
        "destination_contains": "Perris",
        "base_rate": 495.00,
        "fsc_amount": 108.90,
        "accessorials_total": 30.00,
        "grand_total": 633.90,
    }


# =========================================================================
# Variant 2 — PCD Express: compact table, mm/dd/yyyy, "Total" label
# =========================================================================
def variety_v2_pcd_express():
    s = _styles()
    path = os.path.join(HERE, "variety_v2_pcd_express.pdf")
    doc = SimpleDocTemplate(path, pagesize=LETTER, leftMargin=0.5*inch, rightMargin=0.5*inch,
                            topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    story.append(Paragraph("<b>PCD Express Drayage LLC</b>  ·  ar@pcdexpress.com", s["Body"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph("<b>FREIGHT INVOICE</b>", s["H1"]))

    meta = Table([
        ["Inv #:", "PCDX-77721",       "Load No.:",  "PCDX-LOAD-25051923"],
        ["Date:",  "5/19/2026",        "Container:", "OOLU8217493"],
        ["",       "",                  "MBL:",       "ONEYSZPG60260304"],
    ], colWidths=[1.0*inch, 2.0*inch, 1.1*inch, 2.5*inch])
    meta.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2),
    ]))
    story.append(meta)
    story.append(Spacer(1, 10))

    story.append(Paragraph("<b>From:</b> Los Angeles - Pier 400  →  <b>To:</b> NewAge Perris CA", s["Body"]))
    story.append(Spacer(1, 8))

    # Compact item table with "Line / Description / Qty / Rate / Amount" header
    tbl = Table([
        ["Line", "Description",                        "Qty", "Rate",   "Amount"],
        ["1",    "Drayage Shipment Long Beach→Perris", "1",   "$525.00","$525.00"],
        ["2",    "Fuel Surcharge (22.0%)",             "1",   "—",      "$115.50"],
        ["3",    "Pre-Pull Fee",                       "1",   "$50.00", "$50.00"],
        ["4",    "Chassis Day Use",                    "1",   "$35.00", "$35.00"],
    ], colWidths=[0.5*inch, 3.3*inch, 0.6*inch, 0.9*inch, 1.0*inch])
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
        ("ALIGN", (2,0), (-1,-1), "RIGHT"),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Total: $725.50</b>", s["H2"]))

    doc.build(story)
    return path, {
        "invoice_no": "PCDX-77721",
        "carrier_name_contains": "PCD Express",
        "invoice_date": "2026-05-19",
        "fb_no": "PCDX-LOAD-25051923",
        "container_no": "OOLU8217493",
        "bol": "ONEYSZPG60260304",
        "origin_contains": "Los Angeles",
        "destination_contains": "Perris",
        "base_rate": 525.00,
        "fsc_amount": 115.50,
        "accessorials_total": 85.00,
        "grand_total": 725.50,
    }


# =========================================================================
# Variant 3 — Atlantic Container Services: one-pager, label:value, Balance Due
# =========================================================================
def variety_v3_atlantic_oneliner():
    s = _styles()
    path = os.path.join(HERE, "variety_v3_atlantic_oneliner.pdf")
    doc = SimpleDocTemplate(path, pagesize=LETTER, leftMargin=0.5*inch, rightMargin=0.5*inch,
                            topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    story.append(Paragraph("<b>Atlantic Container Services</b>", s["H1"]))
    story.append(Paragraph("INVOICE", s["BodyB"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Inv #: <b>ACS-INV-99202</b>", s["Body"]))
    story.append(Paragraph("Date: 19-May-2026", s["Body"]))
    story.append(Paragraph("Ref: ACS25052201", s["Body"]))
    story.append(Paragraph("Container: TCLU4729188", s["Body"]))
    story.append(Paragraph("Master B/L: MAEU742193224", s["Body"]))
    story.append(Paragraph("Pickup Port: Long Beach - ETS", s["Body"]))
    story.append(Paragraph("Delivery: NewAge Perris CA", s["Body"]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("<b>Itemized charges</b>", s["BodyB"]))
    story.append(Paragraph("• Linehaul: <b>$545.00</b>", s["Body"]))
    story.append(Paragraph("• FSC (22%): <b>$119.90</b>", s["Body"]))
    story.append(Paragraph("• Detention (2hr): <b>$120.00</b>", s["Body"]))
    story.append(Paragraph("• Chassis Day Use: <b>$35.00</b>", s["Body"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>Balance Due: $819.90</b>", s["H2"]))

    doc.build(story)
    return path, {
        "invoice_no": "ACS-INV-99202",
        "carrier_name_contains": "Atlantic",
        "invoice_date": "2026-05-19",
        "fb_no": "ACS25052201",
        "container_no": "TCLU4729188",
        "bol": "MAEU742193224",
        "origin_contains": "Long Beach",
        "destination_contains": "Perris",
        "base_rate": 545.00,
        "fsc_amount": 119.90,
        "accessorials_total": 155.00,
        "grand_total": 819.90,
    }


# =========================================================================
# Variant 4 — Continental: Equipment Number / BOL-MAWB, 2-digit year
# =========================================================================
def variety_v4_continental_bol():
    s = _styles()
    path = os.path.join(HERE, "variety_v4_continental_bol.pdf")
    doc = SimpleDocTemplate(path, pagesize=LETTER, leftMargin=0.5*inch, rightMargin=0.5*inch,
                            topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    story.append(Paragraph("<b>CONTINENTAL DRAYAGE SOLUTIONS, INC.</b>", s["H1"]))
    story.append(Spacer(1, 6))

    meta = Table([
        ["INVOICE NUMBER",    "INVOICE DATE",  "LOAD ID"],
        ["CDS-INV-77302",     "5/19/26",       "CDS25051902"],
    ], colWidths=[2.2*inch, 1.6*inch, 2.0*inch])
    meta.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
        ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
    ]))
    story.append(meta)
    story.append(Spacer(1, 8))

    meta2 = Table([
        ["EQUIPMENT NUMBER", "BOL/MAWB",          "ORIGIN PORT",      "DESTINATION"],
        ["MSCU2841906",      "MAEU742193180",     "Long Beach - ETS", "NewAge Perris CA"],
    ], colWidths=[1.6*inch, 1.9*inch, 1.7*inch, 1.7*inch])
    meta2.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
        ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
    ]))
    story.append(meta2)
    story.append(Spacer(1, 10))

    # Charges table — different header labels
    charges = Table([
        ["Item", "Charge Description",       "Units", "Rate",     "Subtotal"],
        ["1",    "Drayage - Port to DC",     "1",     "$510.00",  "$510.00"],
        ["2",    "Fuel Surcharge (22.0%)",   "1",     "—",        "$112.20"],
        ["3",    "TONU",                     "1",     "$295.00",  "$295.00"],
    ], colWidths=[0.5*inch, 3.3*inch, 0.7*inch, 1.0*inch, 1.0*inch])
    charges.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
    ]))
    story.append(charges)
    story.append(Spacer(1, 12))
    story.append(Paragraph("<b>AMOUNT DUE: $917.20</b>", s["H2"]))

    doc.build(story)
    return path, {
        "invoice_no": "CDS-INV-77302",
        "carrier_name_contains": "Continental",
        "invoice_date": "2026-05-19",
        "fb_no": "CDS25051902",
        "container_no": "MSCU2841906",
        "bol": "MAEU742193180",
        "origin_contains": "Long Beach",
        "destination_contains": "Perris",
        "base_rate": 510.00,
        "fsc_amount": 112.20,
        "accessorials_total": 295.00,
        "grand_total": 917.20,
    }


# =========================================================================
# Variant 5 — Non-Livingston customs broker, different column order
# =========================================================================
def variety_v5_customs_alt_broker():
    s = _styles()
    path = os.path.join(HERE, "variety_v5_customs_alt_broker.pdf")
    doc = SimpleDocTemplate(path, pagesize=LETTER, leftMargin=0.4*inch, rightMargin=0.4*inch,
                            topMargin=0.4*inch, bottomMargin=0.4*inch)
    story = []
    story.append(Paragraph("<b>ITN Customhouse Brokers, LLC</b>", s["H1"]))
    story.append(Paragraph("U.S. Customs Broker · License #08-08321 · ar@itn-customs.com", s["Body"]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("BROKER INVOICE / ENTRY SUMMARY", s["H2"]))
    story.append(Paragraph("Invoice No.: <b>ITN-CHB-2026-W21-3318</b>", s["Body"]))
    story.append(Paragraph("Invoice Date: 5/19/2026", s["Body"]))
    story.append(Paragraph("Importer of Record: NewAge Products Logistics California Inc.", s["Body"]))
    story.append(Spacer(1, 8))

    # Different column order — Entry / Container / Importer PO / Value / Duty / Tariff / Fees / Subtotal
    rows = [
        ["#", "Entry No.",      "Container No.", "Importer PO", "Entered Value", "HTS Code",   "Duty Rate", "Duty",      "MPF/HMF",  "Brokerage", "Subtotal"],
        ["1", "L26-99205-A",    "ONEU5559528",   "NA-PO-68233", "$172,500.00",   "9403.60.80", "0%",        "$0.00",     "$613.20",  "$125.00",   "$738.20"],
        ["2", "L26-99205-B",    "OOLU8217493",   "NA-PO-68234", "$98,420.00",    "8536.50.90", "2.7%",      "$2,657.34", "$361.42",  "$125.00",   "$3,143.76"],
        ["3", "L26-99205-C",    "TCLU4729188",   "NA-PO-68235", "$210,000.00",   "9403.60.80", "0%",        "$0.00",     "$732.18",  "$125.00",   "$857.18"],
    ]
    tbl = Table(rows, colWidths=[0.25*inch, 0.85*inch, 0.9*inch, 0.85*inch, 0.85*inch, 0.75*inch, 0.55*inch, 0.7*inch, 0.7*inch, 0.7*inch, 0.7*inch])
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
        ("FONTSIZE", (0,0), (-1,-1), 7.5),
        ("GRID", (0,0), (-1,-1), 0.3, colors.grey),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>Invoice Total: $4,739.14</b>", s["H2"]))

    doc.build(story)
    return path, {
        "invoice_no": "ITN-CHB-2026-W21-3318",
        "carrier_name_contains": "ITN",
        "invoice_date": "2026-05-19",
        "grand_total": 4739.14,
        "is_customs": True,
        "entries": [
            {"entry": "L26-99205-A", "container": "ONEU5559528", "po": "NA-PO-68233", "value": 172500.00, "duty": 0.0, "subtotal": 738.20},
            {"entry": "L26-99205-B", "container": "OOLU8217493", "po": "NA-PO-68234", "value": 98420.00, "duty": 2657.34, "subtotal": 3143.76},
            {"entry": "L26-99205-C", "container": "TCLU4729188", "po": "NA-PO-68235", "value": 210000.00, "duty": 0.0, "subtotal": 857.18},
        ],
    }


# =========================================================================
# Variant 6 — Demurrage / per-diem invoice: container at top, day-rate table
# =========================================================================
def variety_v6_demurrage_invoice():
    s = _styles()
    path = os.path.join(HERE, "variety_v6_demurrage_invoice.pdf")
    doc = SimpleDocTemplate(path, pagesize=LETTER, leftMargin=0.5*inch, rightMargin=0.5*inch,
                            topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    story.append(Paragraph("<b>Hapag-Lloyd (America) LLC</b>  ·  Demurrage / Detention Invoice", s["BodyB"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Invoice Number: <b>HL-DEM-2026-04918</b>", s["Body"]))
    story.append(Paragraph("Invoice Date: 5/19/2026", s["Body"]))
    story.append(Paragraph("Container Number: <b>HLBU2238420</b>", s["Body"]))
    story.append(Paragraph("Master B/L: HLCUSEL2403881", s["Body"]))
    story.append(Paragraph("Booking: HLBKG-4881921", s["Body"]))
    story.append(Paragraph("Pickup Port: Long Beach - Pier T (ITS)", s["Body"]))
    story.append(Paragraph("Delivery: NewAge Products Perris CA DC", s["Body"]))
    story.append(Paragraph("Free Time Allowed: 7 days · Last Free Day: 2026-05-10", s["Body"]))
    story.append(Spacer(1, 10))

    rows = [
        ["#", "Day Range",      "Description",                              "Days", "Rate/Day",   "Amount"],
        ["1", "Day 1-3",        "Demurrage per Hapag-Lloyd tariff ladder",  "3",    "$275.00",    "$825.00"],
        ["2", "Day 4-7",        "Demurrage per Hapag-Lloyd tariff ladder",  "4",    "$375.00",    "$1,500.00"],
        ["3", "Day 8+",         "Demurrage per Hapag-Lloyd tariff ladder",  "2",    "$525.00",    "$1,050.00"],
        ["4", "Late Pickup Fee","Out-gate scheduled beyond free time",      "1",    "$125.00",    "$125.00"],
    ]
    tbl = Table(rows, colWidths=[0.4*inch, 1.0*inch, 3.2*inch, 0.6*inch, 0.9*inch, 1.0*inch])
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>AMOUNT DUE: $3,500.00</b>", s["H2"]))

    doc.build(story)
    return path, {
        "invoice_no": "HL-DEM-2026-04918",
        "carrier_name_contains": "Hapag",
        "invoice_date": "2026-05-19",
        "container_no": "HLBU2238420",
        "bol": "HLCUSEL2403881",
        "origin_contains": "Long Beach",
        "destination_contains": "Perris",
        "grand_total": 3500.00,
    }


GENERATORS = [
    variety_v1_maersk_logistics,
    variety_v2_pcd_express,
    variety_v3_atlantic_oneliner,
    variety_v4_continental_bol,
    variety_v5_customs_alt_broker,
    variety_v6_demurrage_invoice,
]


if __name__ == "__main__":
    for gen in GENERATORS:
        path, expected = gen()
        print(f"Generated {os.path.basename(path)}")
