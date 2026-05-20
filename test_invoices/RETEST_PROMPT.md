# Maverick — Retest prompt (post-bug-fix)

Paste the block below into Claude in Chrome.

**App under test:** https://maverick-inbound-freight.onrender.com
**Test pack folder:** `maverick_backend/test_invoices/`

**Files used in this retest:**

| File | Type | Notes |
|---|---|---|
| `TEST_PCD-INV-99003.pdf` | drayage PDF | LB Pier T → Perris, $633.90, clean |
| `TEST_PCD-INV-99004.pdf` | drayage PDF | LB Pier T → Perris, $784.90, planted Detention 2hr accessorial |
| `TEST_CDS-INV-99003.pdf` | drayage PDF | Savannah → Monee, $1,771.00, clean |
| `TEST_ACS-INV-99004.pdf` | drayage PDF | Charleston → Monee, $1,540.40, clean |
| `TEST_PCD-INV-99006.pdf` | drayage PDF | LB Pier T → Perris, $928.90, planted TONU $295 (no dispatch log) |
| `TEST_Bulk_Invoices.xlsx` | drayage Excel | 5 invoices: ACS-99001, PCD-99002, CDS-99002, PCD-99005, ACS-99003 |
| `TEST_LI-99003_customs.pdf` | customs PDF | LI-99003, $10,194.13 (no audit) |
| `TEST_LI-99004_customs.pdf` | customs PDF | LI-99004, $21,487.31 (no audit) |
| `TEST_LI-99005_customs.pdf` | customs PDF | LI-99005, 2 entries, $107,107.55 (audit fires) |
| `TEST_LI-99006_customs.pdf` | customs PDF | LI-99006, $7,721.89 (no audit) |
| `TEST_LI-99007_customs.pdf` | customs PDF | LI-99007, $54,977.65 (audit fires) |
| `TEST_Customs_Bulk_10_customs.xlsx` | customs Excel | 10 entries LI-99002-A…J, $341k (audit fires) |

---

## Prompt — paste into Claude in Chrome

> You are retesting Maverick at **https://maverick-inbound-freight.onrender.com** after a round of bug fixes. The original test report flagged 13 bugs. The dev team says BUG-1, 2, 3, 4, 5, 6, 9, 10, 12 should now be fixed. Your job: confirm or refute each one. For every step, record **PASS / FAIL / N/A** with a one-line note. At the end print a results table + executive summary.
>
> **Files (in `maverick_backend/test_invoices/`):**
> - Drayage PDFs (5): `TEST_PCD-INV-99003.pdf`, `TEST_PCD-INV-99004.pdf`, `TEST_CDS-INV-99003.pdf`, `TEST_ACS-INV-99004.pdf`, `TEST_PCD-INV-99006.pdf`
> - Drayage Excel: `TEST_Bulk_Invoices.xlsx` (5 invoices on a single flat sheet)
> - Customs PDFs (5): `TEST_LI-99003_customs.pdf`, `TEST_LI-99004_customs.pdf`, `TEST_LI-99005_customs.pdf`, `TEST_LI-99006_customs.pdf`, `TEST_LI-99007_customs.pdf`
> - Customs Excel: `TEST_Customs_Bulk_10_customs.xlsx` (10 entries LI-99002-A…J)
>
> Before each phase, note the **current row count** of the table you're about to test. After upload, confirm the count went up by the expected amount.
>
> ---
>
> ## Phase 1 · BUG-6 — Dashboard KPI cards are clickable
>
> 1. Open homepage `/`. Note the cursor when hovering over each KPI tile.
> 2. Click **"$ at risk"** — expect navigation to the drayage invoices list (or an exception-filtered view).
> 3. Click **"Units past LFD"** — expect navigation to the Containers page.
> 4. Click **"Detention > 2 days at DC"** — expect Containers page.
> 5. Click **"Active invoices this week"** — expect drayage invoices.
> 6. Click **"Open audit exceptions"** — expect drayage invoices.
>
> ## Phase 2 · BUG-1, 2, 4 — Drayage Excel bulk upload (5 invoices on one sheet)
>
> 7. Navigate to **Drayage Invoices**. Note the current row count in the **All** tab.
> 8. Click **📄 Upload Invoice** → select `TEST_Bulk_Invoices.xlsx` → **Upload & Audit**.
> 9. Confirm per-file status shows "✓ 5 invoices · $..." (one summary line for the file, not 5 lines — Excel is one file with 5 records inside).
> 10. Confirm the button label changes to **"Close"** and Cancel button is hidden.
> 11. Click Close. Confirm:
>     - All-tab count increased by **exactly 5** (not 6 — header row must be skipped).
>     - The 5 new invoices appear **at the top** of the list (JUST_UPLOADED bubble).
>     - Their carriers are correctly identified: ACS, PCD, CDS, PCD, ACS — NOT "Carrier" (header literal).
> 12. **Hard refresh (F5).** Confirm all 5 invoices are still there (BUG-1 fix). The JUST_UPLOADED bubble clears, but the rows remain.
> 13. Re-upload the same `TEST_Bulk_Invoices.xlsx` file. Confirm:
>     - The per-file results banner shows "(replaced 5 duplicates)" or equivalent.
>     - The summary banner shows total "5 replaced".
>     - The list still has only 5 added rows (no doubling) — All-tab count must equal pre-reupload count (BUG-2 fix).
>
> ## Phase 3 · BUG-1, 9 — Drayage multi-file PDF upload (5 PDFs at once)
>
> 14. Note All-tab count.
> 15. Click **📄 Upload Invoice** → select **all 5 drayage PDFs together**: `TEST_PCD-INV-99003.pdf`, `TEST_PCD-INV-99004.pdf`, `TEST_CDS-INV-99003.pdf`, `TEST_ACS-INV-99004.pdf`, `TEST_PCD-INV-99006.pdf` → **Upload & Audit**.
> 16. Confirm 5 per-file progress lines tick to "✓ extracted · audited".
> 17. Confirm button flips to **"Close"** when all done. Confirm Cancel button is hidden (BUG-9 fix).
> 18. Click Close. Confirm All-tab count increased by 5 and all 5 new PDF invoices bubble at the top.
> 19. **Hard refresh.** Confirm all 5 PDF invoices persist (BUG-1).
> 20. Switch to **Pending Review** tab. Confirm the tab count went up and includes the planted audit invoices `PCD-INV-99004` (detention) and `PCD-INV-99006` (TONU $295).
>
> ## Phase 4 · BUG-3 — Customs Excel bulk upload (one file = 10 entry rows)
>
> 21. Navigate to **Customs Invoices**. Note the current All-tab row count.
> 22. Click **📄 Upload Invoice** → select `TEST_Customs_Bulk_10_customs.xlsx` → **Upload & Audit**.
> 23. Confirm the per-file banner mentions "LI-99002 (10 entries)" or "10 added".
> 24. Click Close. Confirm:
>     - All-tab count increased by **exactly 10** (BUG-3 fix — was previously collapsing to 1).
>     - The 10 new entries appear at the top: LI-99002-A, LI-99002-B, … LI-99002-J.
>     - Each has its own container (ONEU8901234, MSCU7708219, OOLU9912345, HLBU4421890, …) and HTS code.
>     - Two entries with HTS `7308.30.5050` show Sec 232 50% (LI-99002-D, LI-99002-H).
>     - All 10 are in **Pending Review** (because grand total >$50k tripped the HIGH duty-math audit).
> 25. **Hard refresh.** Confirm all 10 entries persist.
> 26. Re-upload the same file. Confirm "10 replaced" message and that the entry count stays the same (no doubling).
>
> ## Phase 5 · BUG-1, 5, 12 — Customs multi-file PDF upload (5 PDFs at once)
>
> 27. Note All-tab count on Customs Invoices.
> 28. Click **📄 Upload Invoice** → select **all 5 customs PDFs together**: `TEST_LI-99003_customs.pdf`, `TEST_LI-99004_customs.pdf`, `TEST_LI-99005_customs.pdf`, `TEST_LI-99006_customs.pdf`, `TEST_LI-99007_customs.pdf` → **Upload & Audit**.
> 29. Confirm 5 per-file progress lines all succeed.
> 30. Note from the summary: 2 of the 5 should have findings (`LI-99005` at $107k, `LI-99007` at $55k — both above the $50k duty-math threshold). The other 3 should be Complete.
> 31. Close. Confirm All-tab count increased by 5 (or 6, since LI-99005 has 2 entries A+B — confirm whichever the system does and note it).
> 32. Confirm `LI-99005` and `LI-99007` are in the **Pending Review** tab; `LI-99003`, `LI-99004`, `LI-99006` are in **Complete**.
> 33. **Hard refresh.** Confirm all customs uploads persist.
>
> ## Phase 6 · BUG-5, 12 — No 404s on container deep links from uploads
>
> 34. From the customs detail page for `LI-99005-A` (or whatever the detail surface is), click the container link `HLBU3344117`.
> 35. Confirm it opens a container detail page (not a 404). The stub may have minimal data ("Auto-created from upload") — that's expected.
> 36. From the drayage detail page for `PCD-INV-99006`, click the container link `ONEU6677889`. Confirm container detail page opens.
> 37. Repeat for any 2 more containers referenced by uploaded invoices — none should 404.
>
> ## Phase 7 · BUG-1 — Cross-page persistence sanity
>
> 38. Navigate to **Loads**. Find the load whose container is `OOLU9912345` (linked from drayage upload `PCD-INV-99002`). Open its Load Detail page.
> 39. Confirm the **Invoices summary** card shows the uploaded drayage row.
> 40. Find the load whose container is `ONEU8901234` (linked from customs upload `LI-99002-A`). Confirm its Invoices summary card shows the uploaded customs entry.
> 41. **Hard refresh** on the Load Detail page. Confirm the summary still shows both invoices after reload.
>
> ## Phase 8 · BUG-10 — Tab counts update
>
> 42. On both Drayage Invoices and Customs Invoices, confirm the **Pending Review** tab count and **All** tab count match the actual visible row counts (no drift).
> 43. Cycle Pending Review → All → Complete → back. Confirm the rows stay in the right tabs.
>
> ## Phase 9 · Regression — sort + new-on-top still works
>
> 44. On drayage list, click **Grand Total** column header. Confirm sort works (↕ → ▲ → ▼).
> 45. Confirm uploaded invoices still bubble to top regardless of sort column.
> 46. Same check on customs list with the **Subtotal** column.
>
> ### Output
>
> Print a markdown table:
>
> | Step | Bug ID | Result | Note |
> |---|---|---|---|
>
> Followed by an executive summary: total PASS / FAIL, which bug IDs are now confirmed fixed, which still fail, and the top 3 unexpected issues if any.

---

## Expected results matrix

| Bug | Phase | What "fixed" looks like |
|---|---|---|
| BUG-1 persistence | 2/3/4/5/7 | Uploads survive F5 |
| BUG-2 dedupe | 2/4 | Re-upload shows "replaced N", no row doubling |
| BUG-3 customs Excel multi-entry | 4 | One xlsx → 10 rows in table |
| BUG-4 drayage Excel header skip | 2 | 5 data rows ingested, header row ignored, carriers correct |
| BUG-5 / BUG-12 container 404 | 6 | Uploaded-container links open detail page (stub OK) |
| BUG-6 KPI clicks | 1 | Cards have pointer cursor + navigate |
| BUG-9 button label | 2/3 | Upload & Audit → Close; Cancel hidden |
| BUG-10 tab counts | 2/3/4/8 | Pending Review and All counts match visible rows |
