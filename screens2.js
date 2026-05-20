// Maverick — screens2.js (Invoice Mgmt: drayage/customs/GL · Rate Card+RFQ · Report · Users)
"use strict";

// =============== INVOICE MANAGEMENT ===============
ROUTES.invoices = function (root, sub) {
  if (!sub) { navigate("invoices/drayage"); return; }
  const parts = sub.split("/");
  const which = parts[0];
  const id = parts[1];
  if (which === "drayage") return id ? renderDrayageDetail(root, id) : renderDrayageList(root);
  if (which === "customs") return id ? renderCustomsDetail(root) : renderCustomsList(root);
  if (which === "gl") return renderGLRecon(root);
  navigate("invoices/drayage");
};

// ---- Drayage list (v5: status tabs + AI auto-approved fold) ----
let DRAY_FILTERS = { tab: "pending", carrier: "all", severity: "all", search: "" };
let DRAY_AUTO_EXPAND = false;
const DRAY_DISPUTED = new Set();  // populated when user opens a dispute

function drayageTabCounts() {
  const all = D.invoices;
  const pending  = all.filter(i => auditByInv[i["Invoice #"]] && !DRAY_DISPUTED.has(i["Invoice #"]));
  const disputed = all.filter(i => DRAY_DISPUTED.has(i["Invoice #"]));
  const complete = all.filter(i => !auditByInv[i["Invoice #"]] && !DRAY_DISPUTED.has(i["Invoice #"]));
  return { all, pending, disputed, complete };
}

function renderDrayageList(root) {
  const { all, pending, disputed, complete } = drayageTabCounts();
  const tabRows = { pending, in_dispute: disputed, complete, all }[DRAY_FILTERS.tab];

  let rows = tabRows.slice();
  if (DRAY_FILTERS.carrier !== "all") rows = rows.filter(r => CARRIER_SHORT[r.Carrier] === DRAY_FILTERS.carrier);
  if (DRAY_FILTERS.severity !== "all") rows = rows.filter(r => (auditByInv[r["Invoice #"]] || {}).Severity === DRAY_FILTERS.severity);
  if (DRAY_FILTERS.search) {
    const q = DRAY_FILTERS.search.toLowerCase();
    rows = rows.filter(r => Object.values(r).some(v => String(v || "").toLowerCase().includes(q)));
  }
  rows.sort((a, b) => {
    const sa = severityRank((auditByInv[a["Invoice #"]] || {}).Severity);
    const sb = severityRank((auditByInv[b["Invoice #"]] || {}).Severity);
    if (sa !== sb) return sb - sa;
    return (b["Grand Total (USD)"] || 0) - (a["Grand Total (USD)"] || 0);
  });

  const showAutoFold = DRAY_FILTERS.tab !== "complete";

  root.innerHTML = `
    <div class="page-title-row">
      <div>
        <h1 class="page-title">Drayage Invoices</h1>
        <div class="page-subtitle"><span class="mono">${all.length}</span> invoices · ${pending.length} need manual review · $1,921.10 at risk across 10 findings</div>
      </div>
      <div class="row">
        <button class="btn" onclick="openUploadModal('drayage')">📄 Upload Invoice</button>
      </div>
    </div>

    <div class="status-tabs">
      ${drayTab("pending",    "Pending Review", pending.length)}
      ${drayTab("in_dispute", "In Dispute",     disputed.length)}
      ${drayTab("complete",   "Complete",       complete.length)}
      ${drayTab("all",        "All",            all.length)}
    </div>

    ${showAutoFold ? `
      <div class="auto-approved">
        <div class="ah" onclick="DRAY_AUTO_EXPAND=!DRAY_AUTO_EXPAND;render()">
          <span class="ah-badge">🤖 AI</span>
          <div>
            <div class="ah-title">Auto-approved by AI audit (${complete.length})</div>
            <div class="ah-sub">The 7-rule audit found no findings on these invoices — math, rate-card match, accessorial cap, and PO link all green. Click to spot-check.</div>
          </div>
          <span class="ah-chev">${DRAY_AUTO_EXPAND ? "▼" : "▶"}</span>
        </div>
        ${DRAY_AUTO_EXPAND ? `
          <div class="ab">
            <table class="tbl">
              <thead>
                <tr><th>Invoice #</th><th>Carrier</th><th>Date</th><th>FB#</th><th>Container</th><th>Lane</th><th class="num">Grand Total</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${complete.slice(0, 40).map(r => `
                  <tr class="clickable" onclick="navigate('invoices/drayage/${h(r["Invoice #"])}')">
                    <td class="mono"><b>${h(r["Invoice #"])}</b></td>
                    <td>${h(CARRIER_SHORT[r.Carrier] || r.Carrier)}</td>
                    <td class="mono">${h(r["Invoice Date"])}</td>
                    <td class="mono">${h(r["FB# / Load ID"])}</td>
                    <td class="mono">${h(r["Container #"])}</td>
                    <td>${h(r.Origin)} → ${h(r.Destination)}</td>
                    <td class="num"><b>${fmt$(r["Grand Total (USD)"])}</b></td>
                    <td><span class="pill ok">Approved</span></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>` : ""}
      </div>
    ` : ""}

    <div class="toolbar">
      ${chip("All carriers", "all", DRAY_FILTERS.carrier, tabRows.length)}
      ${chip("PCD", "PCD", DRAY_FILTERS.carrier, tabRows.filter(r => CARRIER_SHORT[r.Carrier] === "PCD").length)}
      ${chip("CDS", "CDS", DRAY_FILTERS.carrier, tabRows.filter(r => CARRIER_SHORT[r.Carrier] === "CDS").length)}
      ${chip("ACS", "ACS", DRAY_FILTERS.carrier, tabRows.filter(r => CARRIER_SHORT[r.Carrier] === "ACS").length)}
      <span style="width: 14px;"></span>
      <select class="txt" id="drSev" style="font-size:12px;">
        <option value="all" ${DRAY_FILTERS.severity === "all" ? "selected" : ""}>All severity</option>
        <option value="CRITICAL">CRITICAL</option>
        <option value="HIGH">HIGH</option>
        <option value="MEDIUM">MEDIUM</option>
        <option value="LOW">LOW</option>
      </select>
      <span class="spacer"></span>
      <input class="txt" id="drSearch" placeholder="Search invoice, FB#, container…" value="${h(DRAY_FILTERS.search)}" style="width: 260px;">
    </div>

    <div class="card">
      <div class="card-body tight">
        <table class="tbl">
          <thead>
            <tr>
              <th>Invoice #</th><th>Carrier</th><th>Date</th><th>FB#</th><th>Container</th><th>Lane</th>
              <th class="num">Grand Total</th><th>Severity</th><th>Status</th><th>Finding</th>
            </tr>
          </thead>
          <tbody>${rows.length ? rows.map(r => drayRow(r)).join("") : `<tr><td colspan="10" class="empty">No invoices in this view.</td></tr>`}</tbody>
          ${rows.length ? `<tfoot>
            <tr><td colspan="6">${rows.length} invoices</td><td class="num">${fmt$(rows.reduce((s, r) => s + (r["Grand Total (USD)"] || 0), 0))}</td><td colspan="3"></td></tr>
          </tfoot>` : ""}
        </table>
      </div>
    </div>
  `;

  root.querySelectorAll(".chip[data-value]").forEach(c => {
    c.addEventListener("click", () => { DRAY_FILTERS.carrier = c.dataset.value; render(); });
  });
  $("#drSev").addEventListener("change", e => { DRAY_FILTERS.severity = e.target.value; render(); });
  $("#drSearch").addEventListener("input", e => {
    DRAY_FILTERS.search = e.target.value;
    render();
    setTimeout(() => { $("#drSearch") && $("#drSearch").focus(); }, 0);
  });
}

function drayTab(key, label, count) {
  const active = DRAY_FILTERS.tab === key;
  return `<button class="status-tab ${active ? "active" : ""}" onclick="DRAY_FILTERS.tab='${key}';render()">
    ${h(label)} <span class="tab-count">${count}</span>
  </button>`;
}

function drayStatusPill(r) {
  if (DRAY_DISPUTED.has(r["Invoice #"])) return '<span class="pill warn">In Dispute</span>';
  if (auditByInv[r["Invoice #"]]) return '<span class="pill draft">Pending Review</span>';
  return '<span class="pill ok">Complete</span>';
}

function chip(label, value, current, count) {
  return `<button class="chip ${current === value ? "active" : ""}" data-value="${h(value)}">${h(label)} ${count != null ? `<span class="chip-count">${count}</span>` : ""}</button>`;
}

function drayRow(r) {
  const f = auditByInv[r["Invoice #"]];
  return `
    <tr class="clickable" onclick="navigate('invoices/drayage/${h(r["Invoice #"])}')">
      <td class="mono"><b>${h(r["Invoice #"])}</b></td>
      <td>${h(CARRIER_SHORT[r.Carrier] || r.Carrier)}</td>
      <td class="mono">${h(r["Invoice Date"])}</td>
      <td class="mono">${h(r["FB# / Load ID"])}</td>
      <td class="mono">${h(r["Container #"])}</td>
      <td>${h(r.Origin)} → ${h(r.Destination)}</td>
      <td class="num"><b>${fmt$(r["Grand Total (USD)"])}</b></td>
      <td>${f ? pill(f.Severity) : '<span class="pill ok">OK</span>'}</td>
      <td>${drayStatusPill(r)}</td>
      <td class="muted">${f ? `<span class="mono" style="font-size:11px;">${h(f["Rule Family"])}</span>` : "—"}</td>
    </tr>`;
}

window.openUploadModal = function (kind) {
  // kind: 'drayage' (default) or 'customs'
  kind = kind || 'drayage';
  const isCustoms = kind === 'customs';
  const title = isCustoms ? "Upload Customs Invoice" : "Upload Drayage Invoice";
  const endpoint = isCustoms ? "/api/customs-invoices/upload" : "/api/drayage-invoices/upload";
  const sampleDray = ["PCD-INV-50001.pdf", "PCD-INV-50016.pdf", "CDS-INV-30103.pdf", "ACS-INV-21003.pdf"];
  const sampleCustoms = ["LI-US-2026-W19-3318.pdf", "Customs_entry_2026_05.xlsx"];
  const sample = isCustoms ? sampleCustoms : sampleDray;
  const sub = isCustoms
    ? "Accepts PDF, Excel (.xlsx, .xls). Maverick parses entry #, container, HTS, duty rate, Section 301/232, MPF, HMF, brokerage. Audit engine validates duty math and broker MSA caps on import."
    : "Accepts PDF, Excel (.xlsx, .xls). Maverick auto-parses headers, FB#, container, lines, and runs the 9-rule audit on import.";

  openModal(el("div", { class: "modal" }, [
    el("div", { class: "modal-head" }, [
      el("h2", {}, [title]),
      el("button", { class: "x-btn", onclick: closeModal }, ["×"]),
    ]),
    el("div", { class: "modal-body", html: `
      <label for="upl-file-${kind}" style="cursor:pointer;display:block;">
        <div id="upl-zone-${kind}" style="border: 2px dashed #BFD9F2; border-radius: 10px; padding: 28px 20px; text-align: center; background: #F4F9FE; transition: all 0.15s;">
          <div style="font-size: 28px; margin-bottom: 6px;">📄</div>
          <div style="font-weight: 600;">Click to choose a file · PDF, .xlsx, .xls</div>
          <div class="muted" style="margin-top: 4px;">Max 25 MB · single file</div>
          <div id="upl-fname-${kind}" class="mono" style="margin-top: 10px; font-size: 12px; color: #0C447C;"></div>
        </div>
      </label>
      <input id="upl-file-${kind}" type="file" accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style="display:none;">
      <div class="muted" style="margin-top: 10px; font-size: 11.5px;">${sub}</div>
      <div style="margin-top: 14px;">
        <div class="sec-h">Example filenames</div>
        <div class="mono" style="font-size: 11.5px; color:#475569;">${sample.join("&nbsp;&nbsp;·&nbsp;&nbsp;")}</div>
      </div>
      <div id="upl-status-${kind}" style="margin-top: 14px; font-size: 13px;"></div>
    ` }),
    el("div", { class: "modal-foot" }, [
      el("button", { class: "btn secondary", onclick: closeModal }, ["Cancel"]),
      el("button", { class: "btn", id: `upl-go-${kind}`, onclick: () => uploadInvoice(kind, endpoint) }, ["Upload & Audit"]),
    ]),
  ]));

  // Wire file input → filename display
  setTimeout(() => {
    const inp = document.getElementById(`upl-file-${kind}`);
    if (inp) {
      inp.addEventListener('change', () => {
        const f = inp.files[0];
        document.getElementById(`upl-fname-${kind}`).textContent = f ? `✓ ${f.name} (${(f.size/1024).toFixed(0)} KB)` : '';
      });
    }
  }, 50);
};

window.uploadInvoice = async function (kind, endpoint) {
  const inp = document.getElementById(`upl-file-${kind}`);
  const status = document.getElementById(`upl-status-${kind}`);
  const btn = document.getElementById(`upl-go-${kind}`);
  if (!inp || !inp.files.length) {
    status.innerHTML = '<span style="color:#791F1F;">Pick a file first.</span>';
    return;
  }
  const file = inp.files[0];
  btn.disabled = true;
  status.innerHTML = '<em style="color:#0C447C;">Uploading and parsing — running 9-rule audit…</em>';
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch(endpoint, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) {
      status.innerHTML = `<span style="color:#791F1F;">Error: ${data.error}</span>`;
    } else {
      const findings = (data.findings || []).length;
      status.innerHTML = `
        <div style="background:#E1F5EE;padding:12px;border-radius:8px;color:#085041;line-height:1.6;">
          <strong>✓ ${data.invoice_no || data.entry_no || file.name}</strong> imported<br>
          ${data.carrier_name ? `Carrier: ${data.carrier_name}<br>` : ''}
          ${data.grand_total ? `Grand Total: $${(data.grand_total).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}<br>` : ''}
          Extraction confidence: ${((data.extraction_confidence || 0.92) * 100).toFixed(0)}%<br>
          <strong>Audit findings: ${findings}</strong> · Status: <strong>${data.status || (findings ? 'Pending Review' : 'Complete')}</strong>
        </div>`;
      toast(`✓ ${findings} audit findings · status: ${data.status || (findings ? 'Pending Review' : 'Complete')}`);
    }
  } catch (e) {
    status.innerHTML = `<span style="color:#791F1F;">Error: ${e.message}</span>`;
  } finally {
    btn.disabled = false;
  }
};

// ---- Drayage detail ----
function renderDrayageDetail(root, invId) {
  const inv = D.invoices.find(i => i["Invoice #"] === invId);
  if (!inv) { root.innerHTML = `<div class="empty"><strong>Invoice not found</strong>${h(invId)}</div>`; return; }
  const lines = D.invoiceLines.filter(l => l["Invoice #"] === invId);
  const finding = auditByInv[invId];
  const cont = D.containers.find(c => c["Container #"] === inv["Container #"]);
  const cheapest = cheapestLane(inv);

  root.innerHTML = `
    <div class="row" style="margin-bottom:14px;">
      <button class="btn secondary sm" onclick="navigate('invoices/drayage')">← All invoices</button>
    </div>

    <div class="detail-header">
      <div>
        <h1>Invoice <span class="mono">${h(inv["Invoice #"])}</span></h1>
        <div class="muted" style="font-size: 12.5px;">${h(inv.Carrier)} · Invoice date <span class="mono">${h(inv["Invoice Date"])}</span> · Bill-to <b>NewAge Products Logistics California Inc.</b></div>
      </div>
      <div class="row">${finding ? pill(finding.Severity) : '<span class="pill ok">OK</span>'}<span class="pill draft">${h(inv.Status)}</span></div>
    </div>

    ${finding ? `
      <div class="exc-card ${finding.Severity.toLowerCase()}">
        <div class="exc-head">
          <div>
            <div class="exc-title">Audit finding · ${h(finding["Rule Family"])}</div>
            <div class="muted" style="font-size: 12px;">Expected behavior: ${h(finding["Expected Tool Behavior"])}</div>
          </div>
          <div class="row">${pill(finding.Severity)}<span class="exc-amount" style="font-size:16px;">${fmt$(finding["$ Impact (USD)"])}</span></div>
        </div>
        <div class="exc-body" style="margin-top: 8px;">${h(finding["What's Wrong"])}</div>
        <div style="margin-top: 10px;">
          <button class="btn" onclick="openDispute('${h(inv["Invoice #"])}')">Draft dispute</button>
          <button class="btn secondary" style="margin-left: 6px;">Hold payment</button>
        </div>
      </div>` : ""}

    <div class="grid-2-wide">
      <div class="card">
        <div class="card-head"><div class="card-title">Line items</div><div class="card-sub">${lines.length} lines · Ideal vs Actual based on cheapest eligible rate card lane</div></div>
        <div class="card-body tight">
          <table class="tbl">
            <thead>
              <tr><th>#</th><th>Type</th><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Linehaul</th><th>FSC%</th><th class="num">FSC $</th><th class="num">Amount</th><th class="num">Ideal vs Actual</th></tr>
            </thead>
            <tbody>
              ${lines.map(l => {
                const compare = compareToRate(l, cheapest);
                return `
                <tr>
                  <td class="mono">${h(l["Line #"])}</td>
                  <td><span class="pill ${l.Type === "SHIPMENT" ? "blue" : "neutral"}">${h(l.Type)}</span></td>
                  <td>${h(l.Description)}</td>
                  <td class="num mono">${h(l.Qty)}</td>
                  <td class="num mono">${l.Rate != null ? fmt$0(l.Rate) : "—"}</td>
                  <td class="num mono">${l.Linehaul != null ? fmt$0(l.Linehaul) : "—"}</td>
                  <td class="mono">${h(l["FSC %"] || "—")}</td>
                  <td class="num mono">${l["FSC $"] != null ? fmt$(l["FSC $"]) : "—"}</td>
                  <td class="num mono"><b>${fmt$(l.Amount)}</b></td>
                  <td class="num">${compare}</td>
                </tr>`;
              }).join("")}
            </tbody>
            <tfoot>
              <tr><td colspan="8" class="right">Grand total</td><td class="num"><b>${fmt$(inv["Grand Total (USD)"])}</b></td><td></td></tr>
            </tfoot>
          </table>
        </div>
        <div style="padding: 12px 16px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn secondary">Reject</button>
          ${finding ? `<button class="btn secondary" onclick="openDispute('${h(inv["Invoice #"])}')">Send dispute</button>` : ""}
          <button class="btn">Approve invoice</button>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="card-title">Load details</div></div>
          <div class="card-body">
            <dl class="kv-grid">
              <dt>FB# / Load ID</dt><dd><a onclick="navigate('loads/${h(inv["Invoice #"])}')" class="mono">${h(inv["FB# / Load ID"])}</a></dd>
              <dt>Container</dt><dd><a onclick="navigate('containers/${h(inv["Container #"])}')" class="mono">${h(inv["Container #"])}</a></dd>
              <dt>BOL / MBL</dt><dd class="mono">${h(inv["BOL/MBL #"])}</dd>
              <dt>Equipment</dt><dd>${h(inv.Equipment)}</dd>
              <dt>Origin</dt><dd>${h(inv.Origin)}</dd>
              <dt>Destination</dt><dd>${h(inv.Destination)}</dd>
              ${cont ? `<dt>Stage</dt><dd>${stagePill(cont.Stage)}</dd>` : ""}
            </dl>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">Totals</div></div>
          <div class="card-body">
            <dl class="kv-grid">
              <dt>Linehaul</dt><dd class="num mono">${fmt$(inv["Linehaul (USD)"])}</dd>
              <dt>FSC (${h(inv["FSC %"])})</dt><dd class="num mono">${fmt$(inv["FSC (USD)"])}</dd>
              <dt>Accessorials</dt><dd class="num mono">${fmt$(inv["Accessorials (USD)"])}</dd>
              <dt><b>Grand total</b></dt><dd class="num mono"><b>${fmt$(inv["Grand Total (USD)"])}</b></dd>
            </dl>
          </div>
        </div>

        ${cheapest ? `
        <div class="ai-card">
          <span class="ai-badge">AI</span>
          <div class="ai-title">Rate card check</div>
          <div class="ai-body" style="font-size: 12.5px;">
            Cheapest eligible for this lane is <b>${h(cheapest.Carrier)}</b> at <b>${fmt$0(cheapest["Base Rate (USD)"])}</b>${cheapest.Tier ? ` (${cheapest.Tier})` : ""}. ${inv["Linehaul (USD)"] > cheapest["Base Rate (USD)"] ? `Charged linehaul exceeds best rate by <b>${fmt$0(inv["Linehaul (USD)"] - cheapest["Base Rate (USD)"])}</b>.` : "Charged within rate card tolerance."}
          </div>
        </div>` : ""}
      </div>
    </div>
  `;
}

function cheapestLane(inv) {
  const dest = inv.Destination;
  let candidates = D.rateCard.filter(r => r.Carrier && (r["Destination DC"] === dest) && (r.Equipment === inv.Equipment));
  if (candidates.length === 0) candidates = D.rateCard.filter(r => r.Carrier && r.Equipment === inv.Equipment);
  candidates.sort((a, b) => (a["Base Rate (USD)"] || 0) - (b["Base Rate (USD)"] || 0));
  return candidates[0];
}
function compareToRate(line, best) {
  if (line.Type !== "SHIPMENT" || !best || line.Linehaul == null) return '<span class="muted">—</span>';
  const delta = line.Linehaul - best["Base Rate (USD)"];
  if (delta > 0) return `<span class="red mono">+${fmt$0(delta)}</span>`;
  if (delta < 0) return `<span class="green mono">${fmt$0(delta)}</span>`;
  return `<span class="green mono">match</span>`;
}

// ---- Dispute drawer (Gmail / Outlook compatible) ----
window.openDispute = function (invId) {
  const inv = D.invoices.find(i => i["Invoice #"] === invId);
  const f = auditByInv[invId];
  const subject = `Dispute — ${invId} — ${f ? f["Rule Family"] : ""} — ${fmt$(f ? f["$ Impact (USD)"] : 0)}`;
  const body = `Dear ${inv.Carrier},

This dispute notice references invoice ${inv["Invoice #"]} (FB# ${inv["FB# / Load ID"]}, container ${inv["Container #"]}).

Finding: ${f ? f["Rule Family"] : "audit_review"}
Details: ${f ? f["What's Wrong"] : ""}
Amount disputed: ${fmt$(f ? f["$ Impact (USD)"] : 0)}
MSA reference: §4.1 (rate variance) · §6.2 (accessorial review)

We request a credit memo within 14 business days per MSA §9.

Regards,
James Tran
Inbound Freight Manager, NewAge Products`;
  const to = `ar-disputes@${(CARRIER_SHORT[inv.Carrier] || "carrier").toLowerCase()}.com`;
  const cc = "alexander.curlat-rozenberg@newageproducts.com; finance@newageproducts.com";

  const drawer = el("div", { class: "drawer" }, [
    el("div", { class: "drawer-head" }, [
      el("div", {}, [
        el("div", { style: "font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3);" }, ["Dispute draft"]),
        el("div", { style: "font-weight: 600; margin-top: 2px;" }, [`${invId} · ${f ? f["Rule Family"] : ""}`]),
      ]),
      el("button", { class: "x-btn", onclick: closeDrawer }, ["×"]),
    ]),
    el("div", { class: "drawer-body", html: `
      <label class="field"><span class="lbl">To</span><input class="txt" value="${h(to)}"></label>
      <label class="field"><span class="lbl">CC</span><input class="txt" value="${h(cc)}"></label>
      <label class="field"><span class="lbl">Subject</span><input class="txt" value="${h(subject)}"></label>
      <label class="field"><span class="lbl">Body</span><textarea class="txt" rows="14">${h(body)}</textarea></label>
      ${emailActionsHtml({ to, cc, subject, body, onSent: () => { DRAY_DISPUTED.add(invId); closeDrawer(); toast(`Dispute sent — ${invId} moved to In Dispute.`); } })}
    ` }),
    el("div", { class: "drawer-foot" }, [
      el("button", { class: "btn secondary", onclick: closeDrawer }, ["Save draft"]),
    ]),
  ]);
  openDrawer(drawer);
};

// ---- Customs list / detail (v5: status tabs mirror drayage) ----
let CUSTOMS_FILTERS = { tab: "pending" };
let CUSTOMS_AUTO_EXPAND = false;
const CUSTOMS_DISPUTED = new Set();
// 2 entries are flagged for manual review (HS code drift, brokerage cap)
const CUSTOMS_PENDING_ENTRIES = new Set();
function ensureCustomsFlags() {
  if (CUSTOMS_PENDING_ENTRIES.size === 0 && D.customs?.entries?.length >= 2) {
    CUSTOMS_PENDING_ENTRIES.add(D.customs.entries[0].entry);
    CUSTOMS_PENDING_ENTRIES.add(D.customs.entries[1].entry);
  }
}

function renderCustomsList(root) {
  ensureCustomsFlags();
  const c = D.customs;
  const entries = c.entries || [];
  const pending  = entries.filter(e => CUSTOMS_PENDING_ENTRIES.has(e.entry) && !CUSTOMS_DISPUTED.has(e.entry));
  const disputed = entries.filter(e => CUSTOMS_DISPUTED.has(e.entry));
  const complete = entries.filter(e => !CUSTOMS_PENDING_ENTRIES.has(e.entry) && !CUSTOMS_DISPUTED.has(e.entry));
  const tabRows = { pending, in_dispute: disputed, complete, all: entries }[CUSTOMS_FILTERS.tab];

  const finding = (e) => {
    if (e.entry === entries[0]?.entry) return { tag: "HS code drift", note: "HS 7321.11 (cooking appliances) may apply — review broker classification." };
    if (e.entry === entries[1]?.entry) return { tag: "Brokerage cap exceeded", note: "Brokerage $185 exceeds MSA cap of $125/entry." };
    return null;
  };

  const showAutoFold = CUSTOMS_FILTERS.tab !== "complete";

  root.innerHTML = `
    <div class="page-title-row">
      <div>
        <h1 class="page-title">Customs Invoices</h1>
        <div class="page-subtitle">Broker: Livingston International · ${entries.length} entries this period · ${pending.length} need manual review</div>
      </div>
      <div class="row">
        <button class="btn" onclick="openUploadModal('customs')">📄 Upload Invoice</button>
      </div>
    </div>

    <div class="status-tabs">
      ${cusTab("pending",    "Pending Review", pending.length)}
      ${cusTab("in_dispute", "In Dispute",     disputed.length)}
      ${cusTab("complete",   "Complete",       complete.length)}
      ${cusTab("all",        "All",            entries.length)}
    </div>

    ${showAutoFold ? `
      <div class="auto-approved">
        <div class="ah" onclick="CUSTOMS_AUTO_EXPAND=!CUSTOMS_AUTO_EXPAND;render()">
          <span class="ah-badge">🤖 AI</span>
          <div>
            <div class="ah-title">Auto-approved by AI audit (${complete.length})</div>
            <div class="ah-sub">Duty math matches HTS × declared value, Section 301/232 stack correctly, MPF/HMF in tolerance.</div>
          </div>
          <span class="ah-chev">${CUSTOMS_AUTO_EXPAND ? "▼" : "▶"}</span>
        </div>
        ${CUSTOMS_AUTO_EXPAND ? `
          <div class="ab">
            <table class="tbl">
              <thead><tr><th>Entry</th><th>Container</th><th>PO</th><th class="num">Value</th><th>HTS</th><th class="num">Duty</th><th class="num">Subtotal</th><th>Status</th></tr></thead>
              <tbody>
                ${complete.map(e => `
                  <tr class="clickable" onclick="navigate('invoices/customs/${h(c.invoice)}')">
                    <td class="mono"><b>${h(e.entry)}</b></td>
                    <td class="mono">${h(e.container)}</td>
                    <td class="mono">${h(e.po)}</td>
                    <td class="num mono">${fmt$0(e.value)}</td>
                    <td class="mono">${h(e.hts)}</td>
                    <td class="num mono">${fmt$0(e.duty)}</td>
                    <td class="num mono"><b>${fmt$(e.subtotal)}</b></td>
                    <td><span class="pill ok">Approved</span></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>` : ""}
      </div>
    ` : ""}

    <div class="card">
      <div class="card-body tight">
        <table class="tbl">
          <thead>
            <tr><th>Entry #</th><th>Container</th><th>PO</th><th class="num">Value</th><th>HTS</th><th>Sec 301</th><th>Sec 232</th><th class="num">Subtotal</th><th>Status</th><th>Finding</th></tr>
          </thead>
          <tbody>
            ${tabRows.length ? tabRows.map(e => {
              const f = finding(e);
              return `
                <tr class="clickable" onclick="navigate('invoices/customs/${h(c.invoice)}')">
                  <td class="mono"><b>${h(e.entry)}</b></td>
                  <td class="mono">${h(e.container)}</td>
                  <td class="mono">${h(e.po)}</td>
                  <td class="num mono">${fmt$0(e.value)}</td>
                  <td class="mono">${h(e.hts)}</td>
                  <td>${e.sec301 === "—" ? '<span class="muted">—</span>' : `<span class="pill warn">${h(e.sec301)}</span>`}</td>
                  <td>${e.sec232 === "—" ? '<span class="muted">—</span>' : `<span class="pill crit">${h(e.sec232)}</span>`}</td>
                  <td class="num mono"><b>${fmt$(e.subtotal)}</b></td>
                  <td>${cusStatusPill(e)}</td>
                  <td class="muted" style="font-size: 11px;">${f ? `<span class="mono">${h(f.tag)}</span>` : "—"}</td>
                </tr>`;
            }).join("") : `<tr><td colspan="10" class="empty">No entries in this view.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function cusTab(key, label, count) {
  const active = CUSTOMS_FILTERS.tab === key;
  return `<button class="status-tab ${active ? "active" : ""}" onclick="CUSTOMS_FILTERS.tab='${key}';render()">
    ${h(label)} <span class="tab-count">${count}</span>
  </button>`;
}
function cusStatusPill(e) {
  if (CUSTOMS_DISPUTED.has(e.entry)) return '<span class="pill warn">In Dispute</span>';
  if (CUSTOMS_PENDING_ENTRIES.has(e.entry)) return '<span class="pill draft">Pending Review</span>';
  return '<span class="pill ok">Complete</span>';
}

function renderCustomsDetail(root) {
  const c = D.customs;
  root.innerHTML = `
    <div class="row" style="margin-bottom:14px;">
      <button class="btn secondary sm" onclick="navigate('invoices/customs')">← Customs list</button>
    </div>

    <div class="detail-header">
      <div>
        <h1>Customs Invoice <span class="mono">${h(c.invoice)}</span></h1>
        <div class="muted" style="font-size: 12.5px;">${h(c.billTo)} · Period ${h(c.period)} · Terms ${h(c.terms)}</div>
      </div>
      <div class="row"><span class="pill blue">Broker · Livingston</span><span class="pill ok">CLEARED</span></div>
    </div>

    <div class="banner info">
      <span class="banner-icon">ℹ</span>
      <div><b>Duty stack basis:</b> Entered Value × Total Duty Rate = Duty. <b>Section 301</b> (25% China) and <b>Section 232</b> (50% steel) stack on top of the HTS base rate where they apply.</div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">Entries</div><div class="card-sub">${c.entries.length} entries · ${fmt$(c.total)} total</div></div>
      <div class="card-body tight scroll-x">
        <table class="tbl">
          <thead>
            <tr>
              <th>Entry #</th><th>Container</th><th>PO</th><th class="num">Entered Value</th>
              <th>HTS Code</th><th>Duty Rate</th><th>Sec 301</th><th>Sec 232</th>
              <th class="num">Duty</th><th class="num">MPF</th><th class="num">HMF</th>
              <th class="num">Broker</th><th class="num">Subtotal</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${c.entries.map(e => {
              const totalDutyRate = (e.sec301 !== "—" ? 25 : 0) + (e.sec232 !== "—" ? 50 : 0) + parseFloat(e.dutyRate);
              return `
                <tr>
                  <td class="mono"><b>${h(e.entry)}</b></td>
                  <td class="mono">${h(e.container)}</td>
                  <td class="mono">${h(e.po)}</td>
                  <td class="num mono">${fmt$0(e.value)}</td>
                  <td class="mono">${h(e.hts)}</td>
                  <td class="mono">${h(e.dutyRate)}</td>
                  <td>${e.sec301 === "—" ? '<span class="muted">—</span>' : `<span class="pill warn">${h(e.sec301)} China</span>`}</td>
                  <td>${e.sec232 === "—" ? '<span class="muted">—</span>' : `<span class="pill crit">${h(e.sec232)} steel</span>`}</td>
                  <td class="num mono"><b>${fmt$0(e.duty)}</b></td>
                  <td class="num mono">${fmt$(e.mpf)}</td>
                  <td class="num mono">${fmt$(e.hmf)}</td>
                  <td class="num mono">${fmt$(e.brokerage + e.disbursement + e.isf)}</td>
                  <td class="num mono"><b>${fmt$(e.subtotal)}</b></td>
                  <td class="muted" style="max-width: 220px; font-size: 11.5px;">${h(e.notes)}</td>
                </tr>
                <tr style="background: #FBFCFE;">
                  <td colspan="14" class="muted" style="font-size: 11.5px; padding: 6px 14px;">
                    <b>Math:</b> ${fmt$0(e.value)} × ${totalDutyRate.toFixed(1)}% = <span class="mono"><b>${fmt$0(e.duty)}</b></span> duty
                    ${e.sec301 !== "—" ? ` · +25% Section 301 (China)` : ""}
                    ${e.sec232 !== "—" ? ` · +50% Section 232 (steel)` : ""}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
          <tfoot>
            <tr><td colspan="12" class="right"><b>TOTAL</b></td><td class="num"><b>${fmt$(c.total)}</b></td><td></td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

// ============================================================
// GL RECONCILIATION  (route: invoices/gl)
// ============================================================
function renderGLRecon(root) {
  const rows = [
    { account: "5210", name: "Freight-Inbound", accrued: 38847.14, actual: 39120.00, status: "Open" },
    { account: "5215", name: "Duty (Section 301/232)", accrued: 85404.00, actual: 85404.00, status: "Posted" },
    { account: "5220", name: "Brokerage", accrued: 750.00, actual: 750.00, status: "Posted" },
    { account: "5225", name: "Demurrage / Detention", accrued: 0, actual: 375.00, status: "Open" },
  ];

  root.innerHTML = `
    <div class="page-title-row">
      <div>
        <h1 class="page-title">GL Reconciliation</h1>
        <div class="page-subtitle">Period 2026-05 · Source of truth: SAP Business One DTW import</div>
      </div>
      <div class="row">
        <select class="txt">
          <option>2026-05 (current)</option>
          <option>2026-04</option>
          <option>2026-03</option>
        </select>
        <button class="btn" onclick="openJEPreview()">Generate journal entries</button>
      </div>
    </div>

    <div class="card">
      <div class="card-body tight">
        <table class="tbl">
          <thead>
            <tr>
              <th>Account</th><th>Name</th>
              <th class="num">Accrued</th><th class="num">Actual</th>
              <th class="num">Variance $</th><th class="num">Variance %</th>
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const v = r.actual - r.accrued;
              const vp = r.accrued ? (v / r.accrued * 100) : 100;
              const flag = Math.abs(vp) > 2;
              return `
                <tr class="clickable" onclick="openGLLines('${r.account}')">
                  <td class="mono"><b>${r.account}</b></td>
                  <td>${r.name}</td>
                  <td class="num mono">${fmt$(r.accrued)}</td>
                  <td class="num mono">${fmt$(r.actual)}</td>
                  <td class="num mono ${v > 0 ? "red" : "green"}">${v > 0 ? "+" : ""}${fmt$(v)}</td>
                  <td class="num mono ${flag ? "red" : ""}">${vp.toFixed(1)}%</td>
                  <td>${r.status === "Open" ? '<span class="pill warn">Open</span>' : '<span class="pill ok">Posted</span>'}</td>
                  <td><button class="btn-link">View lines ›</button></td>
                </tr>`;
            }).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Period totals</td>
              <td class="num mono"><b>${fmt$(rows.reduce((s, r) => s + r.accrued, 0))}</b></td>
              <td class="num mono"><b>${fmt$(rows.reduce((s, r) => s + r.actual, 0))}</b></td>
              <td class="num mono red"><b>+${fmt$(rows.reduce((s, r) => s + (r.actual - r.accrued), 0))}</b></td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="grid-2" style="margin-top: 14px;">
      <div class="ai-card">
        <span class="ai-badge">AI</span>
        <div class="ai-title">Variance summary</div>
        <div class="ai-body">
          <ul>
            <li><b>5210 Freight-Inbound</b>: actual exceeds accrual by <b>$272.86</b> (0.7%) — within tolerance.</li>
            <li><b>5225 Demurrage</b>: <b>$375 unaccrued</b> from container ONEU0091872 (PCD-INV-50025). Accrual policy gap — flag for Finance.</li>
            <li><b>5215 Duty</b>: matches Livingston broker invoice exactly. Ready to post.</li>
          </ul>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-title">Journal entry preview (SAP B1 DTW)</div></div>
        <div class="card-body">
          <pre class="email" style="font-size: 11.5px; max-height: 220px; overflow: auto;">JournalEntries.csv
RefDate,Memo,LineNum,AccountCode,Debit,Credit,CostCode
2026-05-31,Wk21 Drayage,1,5210,39120.00,,LOGINBD
2026-05-31,Wk21 Drayage,2,2100,,39120.00,
2026-05-31,Wk21 Duty,1,5215,85404.00,,LOGINBD
2026-05-31,Wk21 Duty,2,2100,,85404.00,
2026-05-31,Wk21 Brokerage,1,5220,750.00,,LOGINBD
2026-05-31,Wk21 Brokerage,2,2100,,750.00,
2026-05-31,Wk21 Demurrage,1,5225,375.00,,LOGINBD
2026-05-31,Wk21 Demurrage,2,2100,,375.00,</pre>
        </div>
      </div>
    </div>
  `;
}

window.openGLLines = function (acct) {
  const map = {
    "5210": D.invoices.slice(0, 12).map(i => ({ src: i["Invoice #"], desc: i["FB# / Load ID"] + " · " + i.Carrier, amt: i["Grand Total (USD)"] })),
    "5215": D.customs.entries.map(e => ({ src: e.entry, desc: "Duty · " + e.notes, amt: e.duty })),
    "5220": [{ src: "LI-US-2026-W21-3318", desc: "Brokerage (6 entries × $125)", amt: 750 }],
    "5225": [{ src: "PCD-INV-50025", desc: "ONEU0091872 demurrage (2 days × $187.50)", amt: 375 }],
  };
  const rows = map[acct] || [];
  openModal(el("div", { class: "modal" }, [
    el("div", { class: "modal-head" }, [
      el("h2", {}, [`Account ${acct} — contributing source lines`]),
      el("button", { class: "x-btn", onclick: closeModal }, ["×"]),
    ]),
    el("div", { class: "modal-body", html: `
      <table class="tbl">
        <thead><tr><th>Source</th><th>Description</th><th class="num">Amount</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td class="mono">${h(r.src)}</td><td>${h(r.desc)}</td><td class="num mono">${fmt$(r.amt)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="2" class="right">Total</td><td class="num"><b>${fmt$(rows.reduce((s, r) => s + r.amt, 0))}</b></td></tr></tfoot>
      </table>
    ` }),
    el("div", { class: "modal-foot" }, [
      el("button", { class: "btn", onclick: closeModal }, ["Close"]),
    ]),
  ]));
};
window.openJEPreview = function () { toast("Generated JournalEntries.csv (preview)."); };

// ============================================================
// RATE CARD  (single page: top half table · bottom half RFQ workflow)
// ============================================================
let RATE_FILTER = { carrier: "all", tier: "all", ctype: "all" };
let RFQ_STATE = {
  origin: "Long Beach — Pier T",
  destination: "NewAge Perris CA",
  equipment: "40HC",
  criticality: "HIGH",
  date: "2026-06-01",
  notes: "Live unload preferred. Tri-axle chassis required for ETS terminal pulls. Two-driver team for time-critical moves.",
};

// v5: in-memory new rate-card rows (prepended to the rate-card table)
let RATE_NEW_ROWS = [];
let RATE_NEW_TIMERS = new WeakSet();

function nextLaneId() {
  // RC-WC-{nextSerial} — find max numeric suffix on west-coast lanes
  const seen = D.rateCard.concat(RATE_NEW_ROWS)
    .map(r => (r["Lane ID"] || "").match(/(\d+)\s*$/))
    .filter(Boolean).map(m => parseInt(m[1], 10));
  const next = (seen.length ? Math.max(...seen) : 400) + 1;
  return `RC-WC-${next}`;
}

window.openAddRateModal = function () {
  const carrierList = Object.values(SCORECARD_RAW).map(v => v.name);
  const presetLaneId = nextLaneId();
  openModal(el("div", { class: "modal wide" }, [
    el("div", { class: "modal-head" }, [
      el("h2", { html: `Add rate card lane <span class="muted-2" style="font-size:12px;font-weight:400;">— in-memory; persists until reload</span>` }),
      el("button", { class: "x-btn", onclick: closeModal }, ["×"]),
    ]),
    el("div", { class: "modal-body", html: `
      <div class="grid-2" style="gap:14px;">
        <label class="field"><span class="lbl">Lane ID (auto-generated)</span>
          <input class="txt mono" id="ar_laneId" value="${h(presetLaneId)}">
        </label>
        <label class="field"><span class="lbl">Carrier</span>
          <select class="txt" id="ar_carrier">
            ${carrierList.map(c => `<option>${h(c)}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span class="lbl">Carrier type</span>
          <select class="txt" id="ar_ctype">
            <option>Third-Party Dray</option>
            <option>Premium</option>
            <option>Ocean Carrier Dray</option>
            <option>Rail Carrier Dray</option>
          </select>
        </label>
        <label class="field"><span class="lbl">Equipment</span>
          <select class="txt" id="ar_equip">
            <option>40HC</option>
            <option>53' TL</option>
            <option>53' IM</option>
          </select>
        </label>
        <label class="field"><span class="lbl">Origin (port / terminal)</span>
          <input class="txt" id="ar_origin" placeholder="e.g. Long Beach — Pier T" value="Long Beach — Pier T">
        </label>
        <label class="field"><span class="lbl">Destination DC</span>
          <input class="txt" id="ar_dest" placeholder="e.g. NewAge Perris CA" value="NewAge Perris CA">
        </label>
        <label class="field"><span class="lbl">Lane criticality</span>
          <select class="txt" id="ar_crit">
            <option>HIGH</option>
            <option selected>MEDIUM</option>
            <option>LOW</option>
          </select>
        </label>
        <label class="field"><span class="lbl">Tier</span>
          <select class="txt" id="ar_tier">
            <option>Primary</option>
            <option selected>Backup</option>
            <option>Spot</option>
            <option>Carrier Haulage</option>
            <option>Rail Bundled</option>
          </select>
        </label>
        <label class="field"><span class="lbl">Base rate (USD)</span>
          <input type="number" class="txt num mono" id="ar_rate" value="525" min="0" step="5">
        </label>
        <label class="field"><span class="lbl">FSC %</span>
          <input type="number" class="txt num mono" id="ar_fsc" value="22" min="0" max="50" step="1">
        </label>
        <label class="field"><span class="lbl">Effective from</span>
          <input type="date" class="txt mono" id="ar_eff_from" value="2026-06-01">
        </label>
        <label class="field"><span class="lbl">Effective to</span>
          <input type="date" class="txt mono" id="ar_eff_to" value="2026-12-31">
        </label>
      </div>
      <label class="field"><span class="lbl">Notes</span>
        <textarea class="txt" id="ar_notes" rows="2" placeholder="e.g. Live unload preferred; tri-axle chassis for ETS pulls."></textarea>
      </label>
    ` }),
    el("div", { class: "modal-foot" }, [
      el("button", { class: "btn secondary", onclick: closeModal }, ["Cancel"]),
      el("button", { class: "btn", onclick: () => {
        const newRow = {
          "Lane ID": $("#ar_laneId").value || presetLaneId,
          "Carrier": $("#ar_carrier").value,
          "_carrier_type": $("#ar_ctype").value,
          "Origin Port/Terminal": $("#ar_origin").value,
          "Destination DC": $("#ar_dest").value,
          "Equipment": $("#ar_equip").value,
          "Base Rate (USD)": parseFloat($("#ar_rate").value) || 0,
          "FSC %": $("#ar_fsc").value + "%",
          "Tier": $("#ar_tier").value,
          "_criticality": $("#ar_crit").value,
          "Effective From": $("#ar_eff_from").value,
          "Effective To": $("#ar_eff_to").value,
          "Notes": $("#ar_notes").value,
          "_isNew": true,
          "_newAt": Date.now(),
        };
        RATE_NEW_ROWS.unshift(newRow);
        closeModal();
        render();
        toast(`Rate added — ${newRow["Lane ID"]} · ${newRow.Carrier}`);
        // Clear the NEW flag after 5s
        setTimeout(() => {
          newRow._isNew = false;
          render();
        }, 5000);
      } }, ["Save lane"]),
    ]),
  ]));
};

ROUTES.ratecard = function (root) {
  const carriers = [...new Set(D.rateCard.map(r => r.Carrier).filter(c => c && SCORECARD_RAW[Object.entries(SCORECARD_RAW).find(([k, v]) => v.name === c)?.[0]]))];
  const validRows = RATE_NEW_ROWS.concat(D.rateCard.filter(r => r.Carrier && carriers.includes(r.Carrier)));

  let rows = validRows.slice();
  if (RATE_FILTER.carrier !== "all") rows = rows.filter(r => r.Carrier === RATE_FILTER.carrier);
  if (RATE_FILTER.tier !== "all") rows = rows.filter(r => r.Tier === RATE_FILTER.tier);
  if (RATE_FILTER.ctype !== "all") {
    rows = rows.filter(r => {
      const code = Object.entries(SCORECARD_RAW).find(([k, v]) => v.name === r.Carrier)?.[0];
      return SCORECARD_RAW[code]?.type === RATE_FILTER.ctype;
    });
  }

  // Run ranking for the RFQ form
  const ranking = rankCarriersForLane(RFQ_STATE.origin, RFQ_STATE.destination, RFQ_STATE.equipment, RFQ_STATE.criticality);

  root.innerHTML = `
    <div class="page-title-row">
      <div>
        <h1 class="page-title">Rate Card</h1>
        <div class="page-subtitle">${validRows.length} lanes · ${carriers.length} carriers · contracted base rates and RFQ workflow on one page.</div>
      </div>
      <div class="row">
        <button class="btn" onclick="openAddRateModal()">+ Add rate</button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="card-head">
        <div>
          <div class="card-title">Carriers &amp; Rates</div>
          <div class="card-sub">Carrier type is colored: <span class="ctype tp" style="margin-right:4px;">Third-Party</span><span class="ctype premium" style="margin-right:4px;">Premium</span><span class="ctype ocean" style="margin-right:4px;">Ocean Dray</span><span class="ctype rail">Rail Dray</span> &nbsp;— ocean/rail dray is bundled with the tender, cheap on paper, but scorecard suffers.</div>
        </div>
      </div>
      <div class="card-body" style="padding: 12px 14px;">
        <div class="toolbar" style="margin-bottom: 8px;">
          <select class="txt" id="rfCarrier">
            <option value="all">All carriers</option>
            ${carriers.map(c => `<option ${RATE_FILTER.carrier === c ? "selected" : ""}>${h(c)}</option>`).join("")}
          </select>
          <select class="txt" id="rfTier">
            <option value="all">All tiers</option>
            <option ${RATE_FILTER.tier === "Primary" ? "selected" : ""}>Primary</option>
            <option ${RATE_FILTER.tier === "Backup" ? "selected" : ""}>Backup</option>
            <option ${RATE_FILTER.tier === "Spot" ? "selected" : ""}>Spot</option>
          </select>
          <select class="txt" id="rfType">
            <option value="all">All carrier types</option>
            <option ${RATE_FILTER.ctype === "Third-Party" ? "selected" : ""}>Third-Party</option>
            <option ${RATE_FILTER.ctype === "Premium" ? "selected" : ""}>Premium</option>
            <option ${RATE_FILTER.ctype === "Ocean Carrier Dray" ? "selected" : ""}>Ocean Carrier Dray</option>
            <option ${RATE_FILTER.ctype === "Rail Carrier Dray" ? "selected" : ""}>Rail Carrier Dray</option>
          </select>
          <span class="spacer"></span>
          <span class="muted-2" style="font-size: 11.5px;">${rows.length} of ${validRows.length} lanes</span>
        </div>
        <div style="max-height: 360px; overflow: auto; border: 1px solid var(--border); border-radius: 8px;">
          <table class="tbl">
            <thead style="position: sticky; top: 0; z-index: 1;">
              <tr>
                <th>Lane ID</th><th>Carrier</th><th>Type</th><th>Origin</th><th>Destination</th>
                <th>Equipment</th><th class="num">Base $</th><th>FSC%</th><th>Tier</th><th>Criticality</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const code = Object.entries(SCORECARD_RAW).find(([k, v]) => v.name === r.Carrier)?.[0];
                const ctype = r._carrier_type || SCORECARD_RAW[code]?.type || "Third-Party";
                const crit = r._criticality || laneCriticality(r["Origin Port/Terminal"], r["Destination DC"]);
                return `
                  <tr class="${r._isNew ? 'new-row' : ''}">
                    <td class="mono"><b>${h(r["Lane ID"])}</b>${r._isNew ? '<span class="new-tag">NEW</span>' : ''}</td>
                    <td>${h(r.Carrier)}</td>
                    <td>${carrierTypeTag(ctype)}</td>
                    <td>${h(r["Origin Port/Terminal"])}</td>
                    <td>${h(r["Destination DC"])}</td>
                    <td>${h(r.Equipment)}</td>
                    <td class="num mono">${fmt$0(r["Base Rate (USD)"])}</td>
                    <td class="mono">${h(r["FSC %"])}</td>
                    <td>${tierPill(r.Tier)}</td>
                    <td>${pill(crit)}</td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">RFQ Workflow</div>
          <div class="card-sub">Generate a ranked carrier shortlist for any lane. Hard-floor enforcement by criticality.</div>
        </div>
      </div>
      <div class="card-body">
        ${rfqForm()}

        ${rfqRankingHtml(ranking)}

        ${rfqEmailHtml(ranking)}
      </div>
    </div>
  `;

  $("#rfCarrier").addEventListener("change", e => { RATE_FILTER.carrier = e.target.value; render(); });
  $("#rfTier").addEventListener("change", e => { RATE_FILTER.tier = e.target.value; render(); });
  $("#rfType").addEventListener("change", e => { RATE_FILTER.ctype = e.target.value; render(); });

  $("#rfqOrigin").addEventListener("change", e => { RFQ_STATE.origin = e.target.value; render(); });
  $("#rfqDest").addEventListener("change", e => { RFQ_STATE.destination = e.target.value; render(); });
  $("#rfqEquip").addEventListener("change", e => { RFQ_STATE.equipment = e.target.value; render(); });
  $("#rfqCrit").addEventListener("change", e => { RFQ_STATE.criticality = e.target.value; render(); });
  $("#rfqDate").addEventListener("change", e => { RFQ_STATE.date = e.target.value; render(); });
};

function tierPill(t) {
  if (t === "Primary") return '<span class="pill ok">Primary</span>';
  if (t === "Backup") return '<span class="pill med">Backup</span>';
  if (t === "Spot") return '<span class="pill warn">Spot</span>';
  return `<span class="pill neutral">${h(t)}</span>`;
}

function rfqForm() {
  return `
    <div class="grid-2" style="gap:18px; margin-bottom: 16px;">
      <div>
        <div class="sec-h">Step 1 · Lane</div>
        <div class="grid-2">
          <label class="field"><span class="lbl">Origin port / terminal</span>
            <select class="txt" id="rfqOrigin">
              <option ${RFQ_STATE.origin === "Long Beach — Pier T" ? "selected" : ""}>Long Beach — Pier T</option>
              <option ${RFQ_STATE.origin === "Long Beach — ETS" ? "selected" : ""}>Long Beach — ETS</option>
              <option ${RFQ_STATE.origin === "Los Angeles — Pier 400" ? "selected" : ""}>Los Angeles — Pier 400</option>
              <option ${RFQ_STATE.origin === "Tacoma — Pier 4" ? "selected" : ""}>Tacoma — Pier 4</option>
              <option ${RFQ_STATE.origin === "Newark — Maher" ? "selected" : ""}>Newark — Maher</option>
            </select>
          </label>
          <label class="field"><span class="lbl">Destination DC</span>
            <select class="txt" id="rfqDest">
              <option ${RFQ_STATE.destination === "NewAge Perris CA" ? "selected" : ""}>NewAge Perris CA</option>
              <option ${RFQ_STATE.destination === "NewAge Monee IL" ? "selected" : ""}>NewAge Monee IL</option>
            </select>
          </label>
          <label class="field"><span class="lbl">Equipment</span>
            <select class="txt" id="rfqEquip">
              <option ${RFQ_STATE.equipment === "40HC" ? "selected" : ""}>40HC</option>
              <option ${RFQ_STATE.equipment === "40' Std" ? "selected" : ""}>40' Std</option>
              <option ${RFQ_STATE.equipment === "20' Std" ? "selected" : ""}>20' Std</option>
            </select>
          </label>
          <label class="field"><span class="lbl">Lane criticality</span>
            <select class="txt" id="rfqCrit">
              <option ${RFQ_STATE.criticality === "HIGH" ? "selected" : ""}>HIGH</option>
              <option ${RFQ_STATE.criticality === "MEDIUM" ? "selected" : ""}>MEDIUM</option>
              <option ${RFQ_STATE.criticality === "LOW" ? "selected" : ""}>LOW</option>
            </select>
          </label>
          <label class="field" style="grid-column: 1/-1;"><span class="lbl">Effective date</span>
            <input type="date" class="txt" id="rfqDate" value="${h(RFQ_STATE.date)}">
          </label>
        </div>
      </div>
      <div>
        <div class="sec-h">Step 1 · Requirements &amp; volume</div>
        <label class="field"><span class="lbl">Special requirements</span>
          <textarea class="txt" rows="4">${h(RFQ_STATE.notes)}</textarea>
        </label>
        <div class="ai-card" style="padding: 12px 14px;">
          <span class="ai-badge">AI</span>
          <div class="ai-title">Estimated demand</div>
          <div class="ai-body" style="font-size: 12px;">
            <ul style="margin: 0; padding-left: 14px;">
              <li>Lane volume Q3 2026: <b>~28 moves/wk</b> per current Demand Plan.</li>
              <li>Existing primary at 94% utilization — backup tier sourcing recommended.</li>
              <li>Suggested response deadline: <b>T+5 business days</b> (${addDays(RFQ_STATE.date, 0)}).</li>
            </ul>
          </div>
        </div>
      </div>
    </div>`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function rfqRankingHtml(ranking) {
  const { eligible, excluded, criticality, floor, weights } = ranking;

  const rowHtml = (r, isExcluded) => `
    <tr class="${r.recommended ? "recommended" : ""} ${isExcluded ? "excluded" : ""}">
      <td>
        <div style="font-weight:600;">${h(r.carrier)} ${r.recommended ? '<span class="rec-pill">Recommended</span>' : ''}</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:1px;">${h(r.laneId || "")} · Tier ${h(r.tier || "—")}</div>
      </td>
      <td>${carrierTypeTag(r.type)}</td>
      <td class="num mono"><b>${fmt$0(r.rate)}</b></td>
      <td class="num"><b>${r.composite}</b></td>
      <td class="num">${r.capacity}/wk</td>
      <td style="color:${isExcluded ? '#791F1F' : 'var(--text-3)'}; font-size:11.5px; max-width: 280px;">
        ${isExcluded
          ? `Excluded — composite ${r.composite} &lt; ${criticality} threshold ${floor}`
          : (r.recommended ? "Cheapest eligible · best balance of cost &amp; reliability"
            : (r.composite >= 90 ? "Premium service · highest scorecard"
              : (r.notes || "Eligible")))}
      </td>
    </tr>`;

  return `
    <div class="sec-h">Step 2 · Carrier ranking <span class="count">— ${criticality} lane · floor ≥ ${floor} composite · weights ${(weights.c*100).toFixed(0)}/${(weights.$*100).toFixed(0)}</span></div>
    <table class="rank-table">
      <thead>
        <tr><th>Carrier</th><th>Type</th><th class="num">Base $</th><th class="num">Composite</th><th class="num">Capacity</th><th>Rationale</th></tr>
      </thead>
      <tbody>
        ${eligible.length ? eligible.map(r => rowHtml(r, false)).join("") : `<tr><td colspan="6" class="empty">No eligible carriers at this composite floor.</td></tr>`}
      </tbody>
    </table>

    ${excluded.length ? `
      <div class="rank-divider">Excluded · below ${criticality} composite floor (${floor})</div>
      <table class="rank-table">
        <tbody>${excluded.map(r => rowHtml(r, true)).join("")}</tbody>
      </table>` : ""}
  `;
}

function rfqEmailHtml(ranking) {
  const { eligible, criticality } = ranking;
  if (!eligible.length) return "";
  const subject = `RFQ — ${RFQ_STATE.origin} → ${RFQ_STATE.destination} — ${RFQ_STATE.equipment} — effective ${RFQ_STATE.date}`;
  const body = `Dear Partner,

NewAge Products is opening a Q3-Q4 2026 rate review for the following lane:

  Origin:        ${RFQ_STATE.origin}
  Destination:   ${RFQ_STATE.destination}
  Equipment:     ${RFQ_STATE.equipment}
  Criticality:   ${criticality}
  Volume est.:   ~28 moves/week (Q3 2026 plan)
  Effective:     ${RFQ_STATE.date} through 2026-12-31
  Notes:         ${RFQ_STATE.notes}

Please respond by ${addDays(RFQ_STATE.date, -7)} with:
  · Base rate per move (USD)
  · FSC %
  · Demurrage / detention ladder
  · Weekly capacity commitment
  · Insurance certificate (current)

We will award by ${addDays(RFQ_STATE.date, -4)}.

Regards,
James Tran
Inbound Freight Manager · NewAge Products
james.tran@newageproducts.com · (951) 555-0118`;

  const sendAllTo = eligible.map(r => `bd@${(r.code || r.carrier.toLowerCase().slice(0, 4)).toLowerCase()}.com`).join("; ");

  return `
    <div class="sec-h">Step 3 · AI-drafted RFQ email</div>
    <pre class="email">From:    Inbound Freight, NewAge Products &lt;inbound@newageproducts.com&gt;
To:      ${h(sendAllTo)}
CC:      alexander.curlat-rozenberg@newageproducts.com
Subject: ${h(subject)}

${h(body)}</pre>

    ${emailActionsHtml({ to: sendAllTo, subject, body, onSent: () => toast(`RFQ sent to ${eligible.length} eligible carriers.`) })}

    <div class="sec-h" style="margin-top: 18px;">Step 4 · Response tracker</div>
    <div class="empty" style="padding: 24px 12px;">
      <strong>Responses will appear here</strong>
      Awaiting first response (deadline ${addDays(RFQ_STATE.date, -7)}).
    </div>
  `;
}

// ============================================================
// REPORT  (single Scorecard view per v4 spec)
// ============================================================
let REPORT_CARRIER = "PCD";

ROUTES.report = function (root) {
  const code = REPORT_CARRIER;
  const s = SCORECARD[code];
  const findings = D.audit.filter(a => {
    const prefix = a["Invoice #"]?.slice(0, 3);
    return prefix === code;
  });
  const carrierOptions = Object.entries(SCORECARD_RAW).map(([k, v]) => `<option value="${k}" ${k===code?"selected":""}>${v.name} (${k})</option>`).join("");

  root.innerHTML = `
    <div class="page-title-row">
      <div>
        <h1 class="page-title">Carrier Scorecard</h1>
        <div class="page-subtitle">${s.name} · Rolling 12 weeks · composite ${s.composite} · ${pill(laneCriticality("Long Beach — Pier T", "NewAge Perris CA"))} primary lane</div>
      </div>
      <div class="row">
        <select class="txt" id="scCarrier">${carrierOptions}</select>
        <button class="btn secondary">Export PDF</button>
      </div>
    </div>

    <div class="kpi-grid" style="grid-template-columns: repeat(5, 1fr);">
      ${scKpi("On-time pickup", s.otp, "%", "Target ≥ 92%", s.otp >= 92)}
      ${scKpi("On-time delivery", s.otd, "%", "Target ≥ 95%", s.otd >= 95)}
      ${scKpi("Invoice accuracy", s.iacc, "%", "Target ≥ 95%", s.iacc >= 95)}
      ${scKpi("Accessorial % of base", s.acc, "%", "Target ≤ 8%", s.acc <= 8)}
      ${scKpi("Dispute win rate", s.dispute, "%", "—", true)}
    </div>

    <div class="grid-2" style="margin-top: 14px;">
      <div class="card">
        <div class="card-head"><div class="card-title">12-week spend trend</div></div>
        <div class="card-body"><div class="chart-wrap" style="height: 240px;"><canvas id="scTrend"></canvas></div></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Exception history · all findings against ${code}</div></div>
        <div class="card-body tight">
          <table class="tbl">
            <thead><tr><th>Invoice</th><th>Date</th><th>Rule</th><th>Severity</th><th class="num">$ Impact</th></tr></thead>
            <tbody>
              ${findings.length ? findings.map(a => `
                <tr class="clickable" onclick="navigate('invoices/drayage/${h(a['Invoice #'])}')">
                  <td class="mono"><b>${h(a["Invoice #"])}</b></td>
                  <td class="mono">2026-05-${(a["#"] * 2).toString().padStart(2, "0")}</td>
                  <td><span class="mono" style="font-size: 11.5px;">${h(a["Rule Family"])}</span></td>
                  <td>${pill(a.Severity)}</td>
                  <td class="num mono">${fmt$(a["$ Impact (USD)"])}</td>
                </tr>`).join("")
                : `<tr><td colspan="5" class="empty" style="padding: 24px;">No findings against this carrier in the current period.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <div class="card-head"><div class="card-title">Composite score breakdown</div><div class="card-sub">${s.composite} = 0.30·${s.otp} + 0.25·${s.otd} + 0.20·${s.iacc} + 0.15·(100−${s.acc}) + 0.10·${s.dispute}</div></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;">
          ${scBreakdown("OTP × 30%", s.otp, 0.30)}
          ${scBreakdown("OTD × 25%", s.otd, 0.25)}
          ${scBreakdown("Invoice acc × 20%", s.iacc, 0.20)}
          ${scBreakdown("(100−Acc%) × 15%", 100 - s.acc, 0.15)}
          ${scBreakdown("Dispute win × 10%", s.dispute, 0.10)}
        </div>
      </div>
    </div>
  `;

  $("#scCarrier").addEventListener("change", e => { REPORT_CARRIER = e.target.value; render(); });

  setTimeout(() => {
    const labels = []; for (let w = 10; w <= 21; w++) labels.push("W" + w);
    const base = code === "PCD" ? 22.65 : code === "CDS" ? 8.32 : 6.0;
    const series = labels.map((_, i) => +(base * (0.75 + Math.random() * 0.5)).toFixed(2));
    new Chart($("#scTrend"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: `${code} spend ($k)`,
          data: series,
          borderColor: "#0C447C",
          backgroundColor: "rgba(12,68,124,0.10)",
          fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2,
        }],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#475569", font: { size: 11 } } },
          y: { grid: { color: "rgba(15,23,42,0.06)" }, ticks: { color: "#475569", font: { size: 11 }, callback: v => "$" + v + "k" }, beginAtZero: false },
        },
      },
    });
  }, 30);
};

function scKpi(label, val, suffix, hint, ok) {
  return `
    <div class="kpi">
      <div class="kpi-label">${h(label)}</div>
      <div class="kpi-value">${val}${suffix}</div>
      <div class="kpi-delta ${ok ? "down" : "up"}">${h(hint)}</div>
    </div>`;
}
function scBreakdown(label, val, weight) {
  const contrib = (val * weight).toFixed(1);
  return `
    <div style="text-align:center; padding: 8px 10px; background: #FBFCFE; border: 1px solid var(--border); border-radius: 8px;">
      <div style="font-size: 10.5px; color: var(--text-3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600;">${h(label)}</div>
      <div style="font-size: 22px; font-weight: 600; margin-top: 6px;">${val}</div>
      <div style="font-size: 11px; color: var(--text-3); margin-top: 2px;">contributes <b style="color: var(--brand);">${contrib}</b> pts</div>
    </div>`;
}

// ============================================================
// USERS  (route id: users)
// ============================================================
const USERS = [
  { fn: "James", ln: "Tran", email: "james.tran@newageproducts.com", role: "Inbound Freight Manager", last: "Today" },
  { fn: "Alexander", ln: "Curlat-Rozenberg", email: "alexander.curlat-rozenberg@newageproducts.com", role: "Director of Logistics", last: "Today" },
  { fn: "Alec", ln: "Swindeman", email: "alec.swindeman@newageproducts.com", role: "Sr Manager, Supply Chain", last: "Yesterday" },
  { fn: "Rahul", ln: "Sharma", email: "rahul.sharma@newageproducts.com", role: "Director, Demand Planning", last: "2 days ago" },
  { fn: "Akshay", ln: "Kapasi", email: "akshay.kapasi@newageproducts.com", role: "Global Sourcing Lead", last: "1 week ago" },
  { fn: "Demo", ln: "Finance", email: "finance@newageproducts.com", role: "AP / Finance", last: "Today" },
  { fn: "Demo", ln: "DC Ops Perris", email: "dc.perris@newageproducts.com", role: "DC Operations", last: "Today" },
];

ROUTES.users = function (root) {
  root.innerHTML = `
    <div class="page-title-row">
      <div>
        <h1 class="page-title">Users</h1>
        <div class="page-subtitle">${USERS.length} users · 5 roles · permissions matrix below</div>
      </div>
      <button class="btn" onclick="openUserModal()">+ Add user</button>
    </div>

    <div class="card" style="margin-bottom: 14px;">
      <div class="card-body tight">
        <table class="tbl">
          <thead><tr><th>First name</th><th>Last name</th><th>Email</th><th>Role</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            ${USERS.map((u, i) => `
              <tr>
                <td><b>${h(u.fn)}</b></td>
                <td><b>${h(u.ln)}</b></td>
                <td class="mono" style="font-size: 11.5px;">${h(u.email)}</td>
                <td>${h(u.role)}</td>
                <td class="muted">${h(u.last)}</td>
                <td><button class="btn-link" onclick="openUserModal(${i})">✎ Edit</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Role permissions matrix</div>
          <div class="card-sub">5 roles × 7 sections of Maverick · ✓ = read &amp; write · — = no access</div>
        </div>
      </div>
      <div class="card-body tight">
        <table class="tbl perm-tbl">
          <thead>
            <tr>
              <th>Role</th>
              <th class="center">Dashboard</th>
              <th class="center">Load Mgmt</th>
              <th class="center">Containers</th>
              <th class="center">Invoice Mgmt</th>
              <th class="center">Rate Card</th>
              <th class="center">Report</th>
              <th class="center">Users</th>
            </tr>
          </thead>
          <tbody>
            ${permRow("Inbound Freight Manager",   [1, 1, 1, 1, 1, 1, 0])}
            ${permRow("Director of Logistics",     [1, 1, 1, 1, 1, 1, 1])}
            ${permRow("AP / Finance",              [1, 0, 0, 1, 0, 1, 0])}
            ${permRow("DC Operations",             [1, 1, 1, 0, 0, 1, 0])}
            ${permRow("Read-only (audit)",         [1, 1, 1, 1, 1, 1, 0], true)}
          </tbody>
        </table>
      </div>
    </div>
  `;
};
function permRow(role, perms, readonly) {
  return `<tr>
    <td><b>${h(role)}</b>${readonly ? '<div class="muted" style="font-size: 11px;">view only</div>' : ""}</td>
    ${perms.map(p => `<td class="center">${p ? '<span style="color:#0F8B6E;font-weight:700;">✓</span>' : '<span class="muted-2">—</span>'}</td>`).join("")}
  </tr>`;
}

window.openUserModal = function (idx) {
  const u = (idx != null) ? USERS[idx] : { fn: "", ln: "", email: "", role: "Inbound Freight Manager", last: "—" };
  openModal(el("div", { class: "modal" }, [
    el("div", { class: "modal-head" }, [
      el("h2", {}, [idx != null ? `Edit ${u.fn} ${u.ln}` : "Add user"]),
      el("button", { class: "x-btn", onclick: closeModal }, ["×"]),
    ]),
    el("div", { class: "modal-body", html: `
      <div class="grid-2" style="gap:14px;">
        <label class="field"><span class="lbl">First name</span><input class="txt" value="${h(u.fn)}"></label>
        <label class="field"><span class="lbl">Last name</span><input class="txt" value="${h(u.ln)}"></label>
      </div>
      <label class="field"><span class="lbl">Email</span><input class="txt" value="${h(u.email)}"></label>
      <label class="field"><span class="lbl">Role</span>
        <select class="txt">
          <option ${u.role === "Inbound Freight Manager" ? "selected" : ""}>Inbound Freight Manager</option>
          <option ${u.role === "Director of Logistics" ? "selected" : ""}>Director of Logistics</option>
          <option ${u.role === "Sr Manager, Supply Chain" ? "selected" : ""}>Sr Manager, Supply Chain</option>
          <option ${u.role === "Director, Demand Planning" ? "selected" : ""}>Director, Demand Planning</option>
          <option ${u.role === "Global Sourcing Lead" ? "selected" : ""}>Global Sourcing Lead</option>
          <option ${u.role === "AP / Finance" ? "selected" : ""}>AP / Finance</option>
          <option ${u.role === "DC Operations" ? "selected" : ""}>DC Operations</option>
        </select>
      </label>
      <label class="field">
        <span class="lbl">Authentication</span>
        <div class="banner info" style="margin:0;">
          <span class="banner-icon">🔐</span>
          <div>SSO via Okta + Microsoft Entra ID. No password set here.</div>
        </div>
      </label>
    ` }),
    el("div", { class: "modal-foot" }, [
      el("button", { class: "btn secondary", onclick: closeModal }, ["Cancel"]),
      el("button", { class: "btn", onclick: () => { closeModal(); toast(idx != null ? "User updated." : "User invited via SSO."); } }, [idx != null ? "Save changes" : "Send invite"]),
    ]),
  ]));
};

window.tierPill = tierPill;
