# Maverick — Inbound Freight Manager Backend

A working Flask + SQLite + Anthropic AI backend for the NewAge Inbound Freight Manager assignment demo. Audits drayage invoices, recommends container actions, ranks carriers — all running locally on your Mac.

## Quick start (5 minutes)

```bash
# 1. cd into this folder
cd maverick_backend

# 2. Install dependencies
pip3 install -r requirements.txt

# 3. (Optional but recommended) Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# 4. Boot
python3 app.py
```

First boot auto-creates the SQLite DB, seeds from `../Mock_Drayage_Invoice_Data.xlsx`, and runs the initial audit. Takes ~10 seconds.

Open **http://127.0.0.1:5050** in your browser. Click around the sidebar.

If you set the Anthropic key, AI extractions and the AI exception summary use Claude Sonnet/Haiku. Without the key, deterministic regex + templates kick in — same data, same results, just slightly less polished writing.

## What to verify

These are the acceptance checks. Walk through them in the browser:

1. **Dashboard.** Should show: Active Invoices 50 · Open Exceptions 12 · $ at Risk $2,890.74 · Units Past LFD 2 · Units Dwelling >2d at DC 2.
2. **Drayage Invoices.** Default tab "Pending Review" → 12 invoices. The 10 planted findings are all there: PCD-INV-50006, 07, 08, 13, 16, 19, 22, 25, CDS-INV-30103, ACS-INV-21003. Plus PCD-INV-50011 and PCD-INV-50017 (real patterns the rule engine catches that weren't in the answer key — bonus value).
3. **PCD-INV-50016 detail.** Should show 6 line items, HIGH severity card with $750 (excess_accessorial), and an "Ideal vs Actual" leakage column.
4. **Containers page.** Top KPIs: Past LFD 2 · Dwelling >2d at DC 5 · Demurrage exposure ~$970 · Detention exposure ~$2,915. Panel below shows MSCU7732984 + ONEU8821453 (CRITICAL port-side) and TGHU4521900 + others (consignee-side).
5. **Rate Card.** 43 rates loaded. WCE/Maersk Store Door/Rail Bundled rows show red Carrier Type pills.
6. **Scorecard.** 16 carriers, composite scores color-coded by threshold.
7. **Transfers.** 4 transfers, plus 5 P4 transfer needs listed below.

## Reuploading PDFs (optional — they're already seeded)

If you want to demo the live extraction:

```bash
# Bulk-upload all 50 PDFs
for f in ../sample_invoices/*.pdf; do
  curl -X POST -F "file=@$f" http://127.0.0.1:5050/api/drayage-invoices/upload
  echo
done
```

With the Anthropic key set, each upload goes through Claude Sonnet (native PDF input). Without it, pdfplumber + regex. Either path produces identical structured JSON; the audit runs the same.

## Useful API endpoints

```
GET  /api/kpis
GET  /api/recommendations
GET  /api/containers/summary
GET  /api/rank-carriers?origin=Long+Beach+—+Pier+T&destination=NewAge+Perris+CA&equipment=40HC&criticality=HIGH
POST /api/drayage-invoices/upload         (file upload)
POST /api/drayage-invoices/<id>/dispute
POST /api/loads/dispatch                  (body: {"container_no": "..."} or {"load_ids": [...]})
POST /api/loads/prearrival-forecast
GET  /api/p4-transfer-needs
POST /api/audit-all                       (re-run all audits)
```

## Demo flow (20-minute walk-through)

1. Open dashboard. Read the AI exception summary aloud — $2,890.74 at risk across 12 exceptions.
2. Click into PCD-INV-50016. Show the 5 stacked accessorials and the HIGH severity card.
3. Click "Draft dispute email." Show the pre-filled email with MSA reference and dispute amount.
4. Open the Containers page. Point at the 4 KPI tiles. Show the past-LFD-at-port containers with $720 + $250 demurrage accrued.
5. Click the rate card. Show the 4 carriers on the LB Pier T → Perris lane — point at Maersk Store Door's red badge.
6. Hit `/api/rank-carriers` (or visit the scorecard page) to show how the algorithm picks PCD over the cheaper-but-unreliable Maersk.
7. Open Transfers. Show TR-2026-0047 (the Costco POG) with the compliance reference.
8. Close with the iteration story (P4 REST integration, SAP B1 Service Layer, real EDI 315/322 via project44).

## File map

```
maverick_backend/
├── app.py                  Flask app — all routes
├── db.py                   SQLite connection helpers
├── schema.sql              18-table DDL
├── seed.py                 Load Mock_Drayage_Invoice_Data.xlsx into DB
├── extractor.py            PDF → structured JSON (Anthropic + regex fallback)
├── audit.py                9 rule families; fires on all 10 planted findings
├── recommender.py          6 tactics; stage-gated; outputs ranked actions
├── ranking.py              Composite + criticality + hard threshold algorithm
├── ai.py                   LLM wrapper (Anthropic primary, templates fallback)
├── tracking.py             (mock — for the future EDI/API integration)
├── templates/              Jinja2 templates — one per page
├── static/                 CSS/JS (inline in base.html for v1)
├── data/maverick.db        SQLite database (auto-created)
└── uploads/                PDF drop zone
```

## How the AI is structured

**LLM does** (where it's actually better than rules):

- PDF extraction (extractor.py — native PDF input to Claude Sonnet)
- Plain-English exception summaries (ai.py — Haiku)
- Email drafting: dispatch, dispute, prearrival forecast, RFQ (ai.py — Sonnet)

**Deterministic code does** (defensible to finance):

- All audit math (audit.py — 9 rule families with explicit thresholds)
- Recommendation ranking (recommender.py — 6 tactics with $ math)
- Carrier composite scoring + criticality weighting (ranking.py)
- GL accrual reconciliation
- Stage gating

That separation is the AI-literacy answer: "AI handles writing, code handles math."

## Troubleshooting

**Port 5050 already in use.** Either kill the existing process (`lsof -i :5050` then `kill <pid>`) or change the port at the bottom of `app.py`.

**`anthropic` package import error.** It's optional — the app works without it via the regex fallback. If you want the AI path, `pip3 install anthropic>=0.40.0`.

**DB out of sync after editing the Excel.** Delete `data/maverick.db` and restart the app. It will re-seed.

**Dispatch button doesn't email anything.** It returns the drafted email body via the API; the UI prints it to the page. In production this would go through Gmail or Outlook via SSO.

## What's deliberately NOT here (because it's beyond v1)

- Real EDI 315/322 wiring (mocked from seed data; production target = project44 / Terminal49 webhook or P4 Warehouse pass-through)
- Real SAP Business One Service Layer integration (GL export goes to CSV; production target = direct JournalEntries API call)
- Real SSO via Microsoft Entra ID (mock button)
- The Pre-Arrival Forecast and Refined Pre-Arrival Reminder UI (the API endpoint works; the frontend integration is the next sprint)
- The Batch Dispatch multi-select UI (same — API works, UI is the next sprint)

All five are listed in the iteration roadmap and named explicitly in the demo close.
