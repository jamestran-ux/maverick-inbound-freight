# Maverick — Handoff document

**Last updated:** 2026-05-20
**Owner:** James Tran (interviewing for Inbound Freight Manager @ NewAge Products)
**Deployed:** https://maverick-inbound-freight.onrender.com (Render Starter, auto-deploys from `main`, ~2 min)
**Repo:** https://github.com/jamestran-ux/maverick-inbound-freight

This file is the single source of truth for picking up Maverick work on any machine. Read it first, then `git log --oneline -10` for the latest commits, then the most recent commit message for current intent.

---

## What Maverick is

AI-powered inbound freight tool built for NewAge Products' take-home assignment Part 2. The role asks for an "AI-first" Inbound Freight Manager — Maverick is the tool that role would actually use to:

- Read & extract drayage + customs invoice data (PDF and Excel)
- Match invoices to containers, POs, BOLs, shipments
- Track container status, milestones, demurrage risk
- Audit invoices (9-rule engine: rate variance, accessorial caps, demurrage timing, duty math, brokerage cap, etc.)
- Recommend container dispatch actions
- Surface exception summaries with $ at risk

## Architecture

- **Backend:** Flask + SQLite + Anthropic Claude (for PDF parsing fallback). Render Starter tier.
- **Primary UI** at `/`: 6-file client-side SPA from Claude Design's v5 prototype
  - `prototype-v5.html` (entry), `styles.css`, `data.js` (seed), `app.js` (router + dashboard + load detail), `screens.js` (containers / loads / transfers), `screens2.js` (invoices / rate card / users + upload modal), `workbook.json`
- **API routes** at `/api/*`:
  - `POST /api/drayage-invoices/upload` — multipart, returns single record or `{invoices: [...]}` for flat-list Excel
  - `POST /api/customs-invoices/upload` — multipart, returns single broker invoice or `{entries: [...]}` for multi-entry Excel
- **Admin** (deprecated Jinja UI) at `/admin/*` — keep as fallback, don't extend
- **Extractor** (`extractor.py`) handles PDFs (pdfplumber + regex, or Anthropic when ANTHROPIC_API_KEY is set) and Excel (3 shapes: flat multi-invoice, side-by-side metadata, multi-sheet master workbook)

## Local layout

```
maverick_backend/
├── app.py              Flask routes + upload endpoints
├── extractor.py        PDF + Excel extraction (3 Excel shapes)
├── audit.py            9-rule audit engine
├── ai.py / recommender.py / ranking.py / tracking.py
├── data.js             ~108 KB seed data (window.DATA = {invoices, containers, customs, pos, ...})
├── app.js / screens.js / screens2.js   Client-side SPA
├── styles.css / prototype-v5.html
├── workbook.json       Master mock data
├── sample_invoices/    50 seed PDFs (PCD/ACS/CDS-INV-{20000s, 30000s, 50000s})
├── test_invoices/      Test pack + retest prompt
│   ├── _generate.py            Run to regenerate all test fixtures
│   ├── CLAUDE_CHROME_E2E_TEST.md  First-pass E2E test (used before bug fixes)
│   ├── RETEST_PROMPT.md        9-phase retest plan (use this now)
│   ├── TEST_PCD-INV-99001.pdf, TEST_CDS-INV-99001.pdf  initial single-PDF tests
│   ├── TEST_PCD-INV-99003/4/6.pdf, TEST_CDS-INV-99003.pdf, TEST_ACS-INV-99004.pdf  retest 5-PDF drayage pack
│   ├── TEST_LI-99001/3/4/5/6/7_customs.pdf  customs PDFs (LI-99001 single, others retest pack)
│   ├── TEST_Bulk_Invoices.xlsx       5 drayage invoices on one flat sheet
│   └── TEST_Customs_Bulk_10_customs.xlsx  10 customs entries in one broker invoice
├── render.yaml / Procfile / requirements.txt
└── HANDOFF.md          ← this file
```

## Recent commits (in order, oldest first)

```
b27af4c  Multi-file upload, sortable columns, new-on-top, Load Detail invoices summary, mock test data + Claude Chrome E2E prompt
fd1609a  Add customs invoice mock + extend Claude Chrome E2E to cover customs upload
18311ef  Add TEST_Customs_Bulk_10_customs.xlsx — 10 customs entries
04c3e76  Bug fixes from E2E test report: P0 persistence + P1 multi-row parsing + KPI clicks
88b0e25  Retest pack: 5 drayage PDFs + 5 customs PDFs + 5-invoice drayage Excel + retest prompt
```

## Bug-fix status (from the 2026-05-20 Claude-in-Chrome E2E test report)

### Fixed in commit 04c3e76 (8 of 13)

| ID | Severity | What was wrong | Fix |
|---|---|---|---|
| BUG-1 | P0 | Uploaded invoices never persisted | `_upsertDrayage` / `_upsertCustomsEntry` in `screens2.js` mutate `D.invoices` / `D.customs.entries` and write to `localStorage` key `maverick_uploads_v1`. `_rehydrate` IIFE merges back at script load. |
| BUG-2 | P0 | Duplicate re-upload silently succeeded | Upserts dedupe by Invoice # / entry # and report "Replaced N duplicates" in the per-file row + summary banner |
| BUG-3 | P1 | Customs Excel collapsed 10 entries to 1 broker row | Backend `api_upload_customs` reads `data.lines` and builds an `entries[]` array (entry/container/PO/HTS/duty/MPF/HMF/Sec301/Sec232). Frontend explodes into N rows. Extractor `_extract_from_multisheet` also captures the customs-entry fields. |
| BUG-4 | P1 | Drayage Excel parser read header row as invoice | `extractor.py _extract_from_excel` shape (1): detects "Invoice #" in row 1, iterates from row 2, returns primary record + `invoices[]`. Belt-and-suspenders check rejects literal "Invoice Number". |
| BUG-5 / BUG-12 | P2 / P3 | Container detail 404 for containers referenced by uploads | `_ensureContainerStub()` in `screens2.js` injects neutral container records on upload. Called inside both upsert helpers. |
| BUG-6 | P2 | Dashboard KPI cards had no click handlers | `kpiTile()` + `_kpiRoute()` map labels to routes ($ at risk → invoices/drayage, Past LFD → containers, etc.) |
| BUG-9 | P2 | "Cancel" / "Upload & Audit" label didn't flip after success | Upload button flips to "Close" + hides Cancel + replaces onclick |
| BUG-10 | P2 | Pending Review tab count didn't update | `drayageTabCounts()` now also classifies as pending when `Status` field contains "PENDING". Customs gets `CUSTOMS_PENDING_ENTRIES.add()` on findings. |

### Deferred (not coded yet)

| ID | Severity | Status |
|---|---|---|
| BUG-7 | P2 | Audit-finding card link to non-existent container — should resolve once BUG-12 stub works. **Re-test in Phase 6 of RETEST_PROMPT.md.** |
| BUG-8 | P2 | Customs invoice summary card count didn't recompute — should be fixed by BUG-1 persistence. **Re-test in Phase 4 of retest.** |
| BUG-11 | P3 | Sidebar label divergence: "Loads" vs "Load Visibility", "Transfers" vs "Transfer Request", "Scorecard" vs "Report", "Admin" vs "Inbound Freight Manager", "Logistics Analyst" vs "Director of Logistics". **Needs product decision.** Either update the spec or rename the nav config in `screens.js`. |
| BUG-13 | P3 | Stale element refs after re-render (suspect full subtree re-mount in modal). **Cosmetic, low priority** — would need a focused render audit. |

## Test pack

5 drayage PDFs (multi-file test):
- TEST_PCD-INV-99003 (clean) · 99004 (planted Detention 2hr) · CDS-99003 · ACS-99004 · PCD-99006 (planted TONU $295)

5 customs PDFs (multi-file test):
- TEST_LI-99003 · 99004 · 99005 (audit fires — 2 entries, $107k) · 99006 · 99007 (audit fires — $55k)

Bulk Excel:
- TEST_Bulk_Invoices.xlsx — 5 drayage invoices
- TEST_Customs_Bulk_10_customs.xlsx — 10 customs entries LI-99002-A through J ($341k → HIGH audit)

To regenerate: `python3 test_invoices/_generate.py` from `maverick_backend/`.

## How to deploy a new commit

James pushes from his Mac (Cmd+V doesn't work at terminal password prompts):
```bash
cd ~/Documents/Claude/Projects/"Inbound Freight - NewAge Product"/maverick_backend
git push "https://jamestran-ux:YOUR_NEW_TOKEN@github.com/jamestran-ux/maverick-inbound-freight.git" main
```
Then revoke the token in GitHub Settings → Developer settings → Personal access tokens, and clean shell history:
```bash
LC_ALL=C sed -i '' '/ghp_/d' ~/.zsh_history
```

Render auto-deploys in ~2 min. URL: https://maverick-inbound-freight.onrender.com

## Working style preferences

- James prefers depth-first, iterative work with grounded ops context — not theoretical fluff.
- He runs E2E tests via Claude in Chrome and pastes bug reports back in for triage. Treat bug reports as the source of truth.
- He'll handle the `git push` himself — leave commits staged locally and tell him the push command.
- Don't reflexively re-add features that are already done. Always `git log` first.
- Don't refer to internal session paths in user-facing messages — refer to "your workspace folder" or the file name.

## Next likely tasks

1. **Re-run RETEST_PROMPT.md** (Phases 1–9). Confirm BUG-7 and BUG-8 resolve as a side effect of BUG-12 / BUG-1 fixes.
2. **Decide BUG-11**: align sidebar labels with the spec, or update the spec.
3. **Polish for demo**: any remaining cosmetic issues from retest, and any "what Alex wants to see" items not yet fully covered (ideal vs actual cost, 2–3 scheduling tactics, clear exception summary, container tracking visibility).
4. **Prepare the actual interview demo flow** — likely a 10-min walkthrough hitting Dashboard → Containers (HIGH risk) → Upload Invoice (multi-file) → Pending Review → Load Detail → Rate Card composite ranking.
