# Maverick — Claude in Chrome E2E Test Prompt

Paste the prompt block below into Claude in Chrome to drive an end-to-end test of every assignment requirement and the "what Alex wants to see" rubric. Claude will navigate the deployed app, upload the three mock test files, and report a pass/fail table.

**App under test:** https://maverick-inbound-freight.onrender.com
**Mock test files (in this folder):**
- `TEST_PCD-INV-99001.pdf` — Pacific Coastline drayage, LB Pier T → Perris CA, $633.90, container `ONEU8901234`
- `TEST_CDS-INV-99001.pdf` — Continental drayage, Savannah → Monee IL, $1,976.00, container `MSCU7708219`, planted pre-pull accessorial (should audit)
- `TEST_Bulk_Invoices.xlsx` — two invoices in one file: `ACS-INV-99001` ($1,617.60) and `PCD-INV-99002` ($663.90)

---

## Prompt for Claude in Chrome

> You are testing **Maverick**, an AI-powered inbound freight tool, deployed at **https://maverick-inbound-freight.onrender.com**. I will hand you three mock invoice files. Walk through the test plan below in order. For each step, take a screenshot if anything looks off, then record **PASS / FAIL / N/A** with a one-line note. At the end, print a results table.
>
> **Mock test files to upload (in `maverick_backend/test_invoices/`):**
> - `TEST_PCD-INV-99001.pdf`
> - `TEST_CDS-INV-99001.pdf`
> - `TEST_Bulk_Invoices.xlsx`
>
> ### Test plan
>
> **A. Dashboard & navigation**
> 1. Open the homepage. Confirm the Maverick sidebar loads with sections: Dashboard, Loads, Transfers, Containers, Drayage Invoices, Customs Invoices, GL Reconciliation, Rate Card & RFQ, Scorecard, Users.
> 2. On Dashboard, confirm the KPI cards render numeric values (containers in transit, $ at risk, exceptions, on-time %). Confirm at least one AI-suggested action is visible.
>
> **B. Container tracking & milestones** (assignment: "Track containers via EDI/API · Identify milestones")
> 3. Click **Containers**. Confirm the list shows columns including Container #, Steamship Line, Stage, LFD, Demurrage Risk.
> 4. Click any container with stage **Out-Gate Ready**. Confirm a milestone timeline renders with checkpoints (Vessel ETD → Arrival → Discharge → Customs Cleared → SSL Released → Out-Gate Ready → Pickup → In Transit → Delivered → Empty Returned) and the current stage is highlighted.
>
> **C. Load detail · invoices summary** (new feature)
> 5. Click **Loads**, pick any load, and open its detail page.
> 6. Confirm there is an **"Invoices summary"** card showing the drayage invoice (invoice #, carrier, grand total, status, audit severity) AND, if the container has one, the matched customs entry (entry #, broker, subtotal, duty, status). Confirm a "Combined landed cost" line appears.
>
> **D. Read & extract invoice data — PDF upload** (assignment minimum: "Read & extract PDF invoice data")
> 7. Navigate to **Drayage Invoices**.
> 8. Click **📄 Upload Invoice**. Confirm the modal opens and allows **multiple file selection**.
> 9. Select **both** `TEST_PCD-INV-99001.pdf` and `TEST_CDS-INV-99001.pdf` together. Click **Upload & Audit**.
> 10. Watch the per-file progress lines tick to "✓ extracted · audited". Confirm both succeed.
> 11. Confirm the button label becomes **"Close"** (not "Upload & Audit") when finished.
> 12. Click Close. Confirm:
>     - `PCD-INV-99001` and `CDS-INV-99001` appear **at the top** of the drayage table (highlighted "JUST UPLOADED" via row order).
>     - `PCD-INV-99001` shows grand total **$633.90**, carrier "Pacific Coastline Drayage", container `ONEU8901234`.
>     - `CDS-INV-99001` shows grand total **$1,976.00**, carrier "Continental Drayage Solutions".
>
> **E. Read & extract — Excel upload** (assignment minimum: "Read & extract Excel invoice data")
> 13. Re-open the upload modal. Select `TEST_Bulk_Invoices.xlsx`. Click Upload & Audit.
> 14. Confirm extraction succeeds for **both** rows: `ACS-INV-99001` ($1,617.60) and `PCD-INV-99002` ($663.90).
> 15. Confirm both surface at the top of the drayage list after Close.
>
> **F. Sortable columns + new-on-top** (new feature)
> 16. Click the **Grand Total** column header. Confirm the table sorts ascending; the "↕" indicator becomes "▲".
> 17. Click it again. Confirm it sorts descending ("▼").
> 18. Switch the status tab to **All**. Confirm the just-uploaded invoices **still bubble to the top** regardless of sort column (newly-uploaded override).
> 19. Click the Carrier header. Confirm alphabetical sort works.
>
> **G. Match invoice → container/PO/shipment** (assignment minimum: "Match invoice to container, carrier, shipment, PO")
> 20. Click `PCD-INV-99001` to open its detail page (or use the "Linked Load" link).
> 21. Confirm the page shows: container `ONEU8901234`, FB# `PCD25051801`, BOL `ONEYSZPG60270001`, carrier "Pacific Coastline Drayage", origin/destination, lane criticality pill.
>
> **H. Discrepancy / exception detection** (assignment minimum: "Flag discrepancies, missed milestones, duplicate charges, exceptions")
> 22. Open `CDS-INV-99001`. Confirm an **Audit finding** card appears (pre-pull/storage accessorial was planted to trigger a rule). Note the dollar impact.
> 23. Go back to drayage list. Switch to **Pending Review** tab. Confirm flagged invoices show with severity pills (LOW / MED / HIGH / CRITICAL).
> 24. Open the seeded `PCD-INV-50016` (or any pre-existing exception). Confirm the original 10 planted audit findings still trigger; check the dashboard "$ at risk" total reflects them ($1,921+).
>
> **I. Customs invoice upload + match** (assignment minimum extends to customs)
> 25. Navigate to **Customs Invoices**. Click **📄 Upload Invoice**. Confirm the customs modal opens (it accepts the same PDF/Excel formats).
> 26. Cancel out — we don't have a customs mock yet, but the modal must open and read multi-file input.
> 27. From the customs list, click any entry. Confirm the entry detail shows: entry #, container link, PO, HTS, Sec 301/232 flags, duty, subtotal, status.
>
> **J. Recommend container actions** (assignment minimum: "Recommend container actions")
> 28. Back to **Containers**. Find a container with HIGH/CRITICAL Demurrage Risk and Out-Gate Ready stage.
> 29. Confirm the row action column shows a recommendation (e.g., "Dispatch today · Pier T 08:00–10:00").
> 30. Open that container's load detail. Confirm the **AI Suggested action** card explains the dispatch logic and quotes a projected savings.
>
> **K. Ideal vs actual cost analysis** (Alex wants to see)
> 31. Navigate to **Rate Card & RFQ**. Confirm rate-card view shows carrier × lane composite scores and that ranking page exists.
> 32. Open the LB Pier T → Perris HIGH lane. Confirm:
>     - PCD is recommended.
>     - WCE / Maersk are listed but excluded ("below composite floor").
>     - Each carrier has cost + service score + composite + a 1-line "why".
>
> **L. Container tracking visibility** (Alex wants to see)
> 33. On Dashboard, confirm there's a panel/section showing live container counts by stage + at-risk count.
> 34. Click into the "Containers at risk" card. Confirm filter applies (only HIGH/CRITICAL demurrage rows visible).
>
> **M. Actionable scheduling tactics** (Alex wants to see — 2–3 tactics)
> 35. On any HIGH-risk container, confirm Maverick surfaces at least one of: (a) dispatch sequencing, (b) appointment-window suggestion, (c) per-diem ladder warning, (d) carrier reroute / mode shift suggestion.
> 36. Capture the tactic text verbatim.
>
> **N. Exception summary clarity** (Alex wants to see — "clear exception summary")
> 37. Navigate to the **Scorecard** or **GL Reconciliation** page. Confirm a roll-up of exceptions / variances appears (categories, $ amount, count).
> 38. From Dashboard, confirm "$ at risk" KPI is clickable and drills into the exceptions list.
>
> **O. Auth / RBAC sanity**
> 39. Navigate to **Users**. Confirm the role/permission matrix table renders (Admin / Logistics Analyst / AP-Finance / DC Ops / Read-only).
>
> **P. Regression — sort + new-upload composability**
> 40. After all uploads, sort drayage by **Invoice Date** descending. Confirm newly-uploaded invoices still appear first (JUST_UPLOADED bubble overrides column sort).
> 41. Refresh the page. Confirm uploads persist (rows still present, though JUST_UPLOADED bubble clears on reload — expected behavior).
>
> ### Output
> Print a markdown results table with columns: **Step #**, **Requirement**, **Result (PASS/FAIL/N/A)**, **Note**. At the bottom, give a short executive summary: total PASS / FAIL, and the top 3 issues if any.

---

## What this validates against the brief

| Brief item | Covered by step(s) |
|---|---|
| Read & extract PDF invoice data | D7–D12 |
| Read & extract Excel invoice data | E13–E15 |
| Match invoice → container / carrier / shipment / PO | G20–G21 |
| Track container status via EDI/API | B3–B4, L33–L34 |
| Identify milestones (ETA, availability, free time, LFD, pickup, return, delivery) | B4, J28–J30 |
| Recommend container actions | J28–J30, M35–M36 |
| Flag discrepancies / missed milestones / duplicate charges / exceptions | H22–H24, N37–N38 |
| Ideal vs actual cost analysis | K31–K32 |
| Container tracking visibility | L33–L34 |
| 2–3 actionable scheduling tactics | M35–M36 |
| Clear exception summary | N37–N38 |
| Customs invoice ingest | I25–I27 |
| Multi-file upload + sortable columns + new-on-top | D8–D12, F16–F19, P40–P41 |
| Invoices summary on Load Detail page | C5–C6 |
