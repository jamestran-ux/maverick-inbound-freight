# Maverick — Live State Snapshot

**Last updated:** 2026-05-20
**Deployed at:** https://maverick-inbound-freight.onrender.com
**GitHub:** https://github.com/jamestran-ux/maverick-inbound-freight
**Local working copy:** `~/Documents/Claude/Projects/Inbound Freight - NewAge Product/maverick_backend`
**Render:** auto-redeploys from `main`, ~2 min after push

> This file mirrors the auto-memory that lived in the Cowork session. Read it first when picking up the project in a new Claude Code session.

---

## Architecture (don't relearn this)

- Flask + SQLite + Anthropic AI backend
- `/` serves a 6-file client-side SPA: `prototype-v5.html`, `styles.css`, `data.js`, `app.js`, `screens.js`, `screens2.js`, `workbook.json`
- `/api/*` are real backend routes (`/api/drayage-invoices/upload`, `/api/customs-invoices/upload`, etc.)
- `/admin/*` is the older Jinja UI (deprecated, kept for fallback)

## Latest local commits (verify with `git log --oneline -10`)

```
f5e44ec  Round-2 bug fixes (BUG-14..27): audit persistence, customs PDF/Excel extraction completeness, deep-link survival, NaN guards, carrier normalization
7ba37f1  HANDOFF.md — single source of truth for picking up on any machine
88b0e25  Retest pack: 5 drayage PDFs + 5 customs PDFs + 5-invoice drayage Excel + retest prompt
04c3e76  Bug fixes from E2E test report: P0 persistence + P1 multi-row parsing + KPI clicks
18311ef  Add TEST_Customs_Bulk_10_customs.xlsx — 10 customs entries
fd1609a  Add customs invoice mock + extend Claude Chrome E2E to cover customs
b27af4c  Multi-file upload, sortable columns, new-on-top, Load Detail invoices summary, mock test data + Claude Chrome E2E prompt
```

**Push status (verified 2026-05-20):** 3 commits ahead of `origin/main` — `f5e44ec`, `7ba37f1`, `88b0e25` are local-only. Everything from `04c3e76` and earlier is pushed.

## Push pattern (token-in-URL)

Cmd+V doesn't work at terminal password prompts on James's Mac, so use this pattern:

```bash
cd ~/Documents/Claude/Projects/"Inbound Freight - NewAge Product"/maverick_backend
git push "https://jamestran-ux:YOUR_TOKEN@github.com/jamestran-ux/maverick-inbound-freight.git" main
```

After successful push:
1. Revoke the token at https://github.com/settings/tokens
2. Scrub from history: `LC_ALL=C sed -i '' '/ghp_/d' ~/.zsh_history`

---

## Round 1 — Bug fixes (commit 04c3e76)

**Fixed (8 of 13):**

| ID    | Description                                  | How fixed |
|-------|----------------------------------------------|-----------|
| BUG-1 | Uploaded invoices never persist              | `_upsertDrayage` / `_upsertCustomsEntry` mutate `D.invoices`/`D.customs.entries`; localStorage key `maverick_uploads_v1` survives F5 |
| BUG-2 | Duplicate Invoice # not deduped              | Upserts replace by Invoice/entry #; toast says "Replaced N duplicates" |
| BUG-3 | Customs Excel only ingested 1 entry          | Backend returns `entries[]`; frontend explodes 1 file → N rows |
| BUG-4 | Drayage Excel header row treated as data     | `_extract_from_excel` shape (1) iterates row 2+, returns `invoices[]` |
| BUG-5 | Container 404 from uploaded invoice          | `_ensureContainerStub` injects neutral container records |
| BUG-6 | KPI tiles non-clickable                      | `kpiTile` accepts route; `_kpiRoute()` maps labels to routes |
| BUG-9 | Upload modal button stuck on "Cancel"        | Flips to "Close" after success; Cancel hidden |
| BUG-10| Tab counts ignore Pending Review             | `drayageTabCounts` classifies Pending when Status contains "PENDING" |

**Deferred (5):**
- BUG-7 audit card → container link — should be resolved by BUG-5 stub; needs retest
- BUG-8 customs summary card recompute — render() should pick up; needs retest
- BUG-11 sidebar label divergence — needs product decision
- BUG-13 render-audit refactor — cosmetic, low priority

---

## Round 2 — Bug fixes (commit f5e44ec)

**Fixed (10 of 14):**

| ID     | Description                                     | How fixed |
|--------|-------------------------------------------------|-----------|
| BUG-14 | Audit findings corrupted on F5                  | localStorage v2 persists rows + auditByInv + customsPending/Disputed; rehydrate is synchronous; HS-drift pinned to LI-869248, brokerage-cap pinned to LI-807627 |
| BUG-15 | Customs PDF only returns grand_total            | `is_customs_pdf` detection branch in `extractor.py`; customs-specific column map for line_table parse |
| BUG-16 | Customs Excel missing HTS/Sec301/Sec232/Notes   | `Invoice_Lines` schema expanded to 19 columns; `_extract_from_multisheet` reads new fields |
| BUG-17 | Container stub lost on F5                       | Stub persists in localStorage; rehydrate replays into `D.containers` |
| BUG-18 | Customs detail container cells not clickable    | Wrapped in `<a onclick="navigate('containers/X')">` |
| BUG-19 | Load detail breaks on FB# URL                   | `renderLoadDetail` looks up by Invoice # then by FB# / Load ID |
| BUG-20 | Customs Math row shows NaN%                     | `parseFloat` guarded with `isNaN` check; fallback placeholder |
| BUG-21 | Drayage status pill defaulted on PENDING REVIEW | `drayStatusPill` honors `r.Status === "PENDING REVIEW"` as fallback |
| BUG-25 | Carrier case mismatch                           | `_normalizeCarrier` folds uppercase variants |
| BUG-22/23 | Various cosmetic fixes rolled in            | See commit diff |

**Deferred (3):**
- BUG-24 Grand Total sort — comparator looked correct; needs post-deploy verification; if still failing, isolate click-binding
- BUG-26 Specific edge case — see commit notes
- BUG-27 Cancel mid-parse — intentional behavior

---

## Retest data and prompt

- `test_invoices/RETEST_PROMPT.md` — 9-phase retest plan
- 5 drayage PDFs: `TEST_PCD-INV-99003/99004/99006.pdf`, `TEST_CDS-INV-99003.pdf`, `TEST_ACS-INV-99004.pdf`
- 5 customs PDFs: `TEST_LI-99003/99004/99005/99006/99007_customs.pdf`
- Drayage Excel: `TEST_Bulk_Invoices.xlsx` (5 invoices)
- Customs Excel: `TEST_Customs_Bulk_10_customs.xlsx` (10 entries)
- Generator: `test_invoices/_generate.py` — run to regenerate after edits

---

## Where to pick up

1. `git status` and `git log origin/main..HEAD --oneline` — confirm what needs pushing
2. Push the staged commits (token-in-URL pattern above)
3. Wait ~2 min for Render redeploy
4. Run `RETEST_PROMPT.md` through Claude in Chrome (or manually if no Chrome connector)
5. Focus retest on BUG-24 (Grand Total sort) — that's the remaining unverified one
6. Triage anything that still fails by theme/root cause, not one-by-one

---

## Key files to know

| File                                          | What it does |
|-----------------------------------------------|--------------|
| `app.py`                                      | Flask routes; `/api/drayage-invoices/upload`, `/api/customs-invoices/upload` |
| `extractor.py`                                | PDF + Excel parsing; `is_customs_pdf` detection; multi-sheet workbook handling |
| `static/screens2.js`                          | Most-changed file: localStorage persistence, upserts, container stubs, audit pinning |
| `static/app.js`                               | `renderLoadDetail`, `kpiTile`, `_kpiRoute`, `auditByInv` |
| `static/data.js`                              | Seed data (invoices, customs entries, containers, audit findings) |
| `test_invoices/_generate.py`                  | Regenerates all mock PDFs + Excels |
| `test_invoices/RETEST_PROMPT.md`              | E2E retest plan for Claude in Chrome |
| `HANDOFF.md`                                  | Onboarding doc for any new machine |
| `CURRENT_STATE.md` (this file)                | Live snapshot of bug-fix state |

---

## Don't re-do work — check the repo first

When continuing this work in a new session:
1. Read `HANDOFF.md` for the big picture
2. Read this file for current bug state
3. Run `git log --oneline -10` to confirm where commits are
4. Read the latest commit message for current intent
5. **Then** start work
