// Maverick — screens.js (containers, transfers)
"use strict";

// ---------- CONTAINERS (v5 rebuild) ----------
let CONT_EXPAND_DELIVERED = false;
let CONT_LAST_REFRESH = new Date();

// Per-diem rates by SSL (fallback to $250/day demurrage; $145/day detention)
function demRate(ssl) {
  const l = D.perDiem.find(p => (p["Steamship Line"]||"").startsWith((ssl||"").split(" ")[0]));
  return l ? l["Demurrage Days 1–3 ($/day)"] : 250;
}
function detRate(ssl) {
  const l = D.perDiem.find(p => (p["Steamship Line"]||"").startsWith((ssl||"").split(" ")[0]));
  return (l && l["Detention Days 1–3 ($/day)"]) ? l["Detention Days 1–3 ($/day)"] : 145;
}
function daysBetweenISO(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// v5 demo containers (the spec calls these out by ID — synthesize so the page
// renders the exact rows on Panel 1 and Panel 2 as specified).
const V5_PORT_PAST_LFD = [
  { container: "MSCU7732984", ssl: "MSC",  vessel: "MSC INGRID",       port: "Long Beach, CA",
    lfd: "2026-05-16", daysPast: 3, daily: 250, accrued: 750, equip: "40HC", po: "NA-PO-68301",
    action: "Dispatch via SDS (premium, capacity available)", carrier: "SoCal Drayage Solutions" },
  { container: "ONEU8821453", ssl: "ONE",  vessel: "ONE OLYMPUS",      port: "Long Beach, CA",
    lfd: "2026-05-18", daysPast: 1, daily: 250, accrued: 250, equip: "40HC", po: "NA-PO-68302",
    action: "Dispatch ASAP via PCD",                          carrier: "Pacific Coastline Drayage" },
];
const V5_DC_DWELLING_EMPTY = [
  { container: "TGHU4521900", ssl: "Maersk",   vessel: "MAERSK LIRQUEN",  loc: "NewAge Perris CA",
    daysDet: 6, daily: 200, accrued: 1200, equip: "40HC", po: "NA-PO-68111",
    action: "Schedule empty return today" },
  { container: "CMAU3380092", ssl: "CMA CGM",  vessel: "CMA CGM JACQUES", loc: "NewAge Perris CA",
    daysDet: 4, daily: 150, accrued: 600, equip: "40HC", po: "NA-PO-68112",
    action: "Schedule empty return today" },
  { container: "HMMU2238420", ssl: "HMM",      vessel: "HMM ALGECIRAS",   loc: "NewAge Perris CA",
    daysDet: 2, daily: 145, accrued: 290, equip: "40HC", po: "NA-PO-68113",
    action: "Schedule empty return this week" },
];
const V5_OGR_SAFE = [
  { container: "OOLU2287405", ssl: "OOCL",      vessel: "OOCL POLAND",     port: "Long Beach, CA",
    lfd: "2026-05-20", daysToLfd: 1, equip: "40HC", po: "NA-PO-68205",
    action: "Book Pier T 08:00–10:00 slot", carrier: "Pacific Coastline Drayage" },
  { container: "BSIU9018734", ssl: "BSL",       vessel: "BSL PRINCESS",    port: "Long Beach, CA",
    lfd: "2026-05-24", daysToLfd: 5, equip: "40HC", po: "NA-PO-68206",
    action: "Schedule appointment this week", carrier: "Continental Drayage Solutions" },
];
const V5_PIPELINE = [
  { container: "ONEU9914032", stage: "Awaiting Discharge", ssl: "ONE",
    vessel: "ONE OLYMPUS",   port: "Long Beach, CA", eta: "2026-05-23", equip: "40HC", po: "NA-PO-68301", note: "Vessel due Sat — 4 days out." },
  { container: "MEDU4421907", stage: "In Customs",         ssl: "MSC",
    vessel: "MSC INGRID",    port: "Long Beach, CA", eta: "2026-05-19", equip: "40HC", po: "NA-PO-68302", note: "CET exam ETA 48h (Livingston flag)." },
  { container: "TCLU3308820", stage: "In Customs",         ssl: "Yang Ming",
    vessel: "YM WONDROUS",   port: "Los Angeles, CA",eta: "2026-05-19", equip: "40HC", po: "NA-PO-68303", note: "Doc hold — broker chasing PO match." },
  { container: "HMMU7714203", stage: "Awaiting Release",   ssl: "HMM",
    vessel: "HMM ALGECIRAS", port: "Los Angeles, CA",eta: "2026-05-18", equip: "40HC", po: "NA-PO-68304", note: "SSL hold — expected released &lt;24h." },
  // Demo references that resolve via live Terminal49 tracking
  { container: "CMDUSHZ7959898", stage: "Awaiting Discharge", ssl: "CMA CGM",
    vessel: "(live · T49)",  port: "Shanghai → LGB",  eta: "live",  equip: "40HC", po: "—", note: "<b>Demo · live Terminal49</b> — CMA CGM master BOL." },
  { container: "TLLU4779831", stage: "Awaiting Discharge",  ssl: "—",
    vessel: "(live · T49)",  port: "—",               eta: "live",  equip: "40HC", po: "—", note: "<b>Demo · live Terminal49</b> — TLLU container." },
  { container: "ZCSU7238990", stage: "Awaiting Discharge",  ssl: "ZIM",
    vessel: "(live · T49)",  port: "—",               eta: "live",  equip: "40HC", po: "—", note: "<b>Demo · live Terminal49</b> — ZIM container." },
  { container: "NYKU0776734", stage: "Awaiting Discharge",  ssl: "ONE",
    vessel: "(live · T49)",  port: "—",               eta: "live",  equip: "40HC", po: "—", note: "<b>Demo · live Terminal49</b> — NYK (now ONE) ref." },
  { container: "KOCU4970299", stage: "Awaiting Discharge",  ssl: "K Line",
    vessel: "(live · T49)",  port: "—",               eta: "live",  equip: "40HC", po: "—", note: "<b>Demo · live Terminal49</b> — K Line ref." },
];

// Status helpers for the Container Status column (Loaded / Empty / Returned)
function containerStatusOf(c) {
  if (!c) return "Loaded";
  if ((c.Status || "").toLowerCase().includes("returned")) return "Returned";
  if (c.Stage === "Delivered") return "Empty";
  return "Loaded";
}
function csTag(status) {
  return `<span class="cs-tag cs-${status}">${h(status)}</span>`;
}

ROUTES.containers = function (root, sub) {
  if (sub) return renderContainerDetail(root, sub);

  const C = D.containers;

  // KPI math from v5 demo data (deterministic)
  const tile1 = V5_PORT_PAST_LFD.length;                                          // 2
  const tile2 = V5_DC_DWELLING_EMPTY.length;                                      // 3
  const tile3 = V5_PORT_PAST_LFD.reduce((s, r) => s + r.accrued, 0);              // 1000
  const tile4 = V5_DC_DWELLING_EMPTY.reduce((s, r) => s + r.accrued, 0);          // 2090
  const customsCount = V5_PIPELINE.filter(r => r.stage === "In Customs").length + 2;

  // Real delivered count from the sheet
  const delivered = C.filter(c => c.Stage === "Delivered");

  root.innerHTML = `
    ${typeof quickStartBanner === "function" ? quickStartBanner() : ""}

    <div class="page-title-row">
      <div>
        <h1 class="page-title">Containers</h1>
        <div class="page-subtitle">Asset-centric view · demurrage at the port &amp; detention at the DC · refreshes on every EDI 315 / 322 event.</div>
      </div>
      <div>
        <input class="txt" id="contSearch" placeholder="Search container # / MBL / vessel…" value="${h((window.CONT_FILTERS && CONT_FILTERS.search) || "")}" style="width: 280px;">
      </div>
    </div>

    <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr);">
      ${kpiTileV5("red",    "Units past LFD — still at port",    tile1,
                  "ONEU8821453 1d past · MSCU7732984 3d past")}
      ${kpiTileV5("orange", "Units dwelling >2d at DC",          tile2,
                  "TGHU4521900 · CMAU3380092 · HMMU2238420")}
      ${kpiTileV5("red",    "Total demurrage exposure (today)",  fmt$(tile3),
                  "Σ daily × days past LFD · port-side")}
      ${kpiTileV5("orange", "Total detention exposure (today)",  fmt$(tile4),
                  "Σ daily × (days at loc − 5 free) · DC-side")}
    </div>

    ${panel1Html()}

    ${panel2Html()}

    ${panel3Html()}

    ${panel4Html(delivered)}

    <div class="edi-footer">
      <span class="dot"></span>
      <div>
        <b>Data source:</b> seeded EDI 315 / 322 events · production wires via <b>project44 / Terminal49</b>.
        All container statuses, demurrage exposure, and KPI counts auto-refresh when the next GPS / EDI update lands.
      </div>
      <span class="ts">Last refresh: ${CONT_LAST_REFRESH.toLocaleString("en-US", { month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit" })}</span>
      <button class="refresh-btn" onclick="refreshContainers()">↻ Refresh</button>
    </div>
  `;

  // Wire container-page search (debounced; mirrors to global topbar input)
  const csi = document.getElementById("contSearch");
  if (csi) {
    csi.addEventListener("input", () => {
      window.CONT_FILTERS.search = csi.value;
      const gs = document.getElementById("globalSearch");
      if (gs && gs.value !== csi.value) gs.value = csi.value;
      clearTimeout(window.__contSearchTimer);
      window.__contSearchTimer = setTimeout(() => {
        render();
        const ne = document.getElementById("contSearch");
        if (ne) { ne.focus(); ne.setSelectionRange(ne.value.length, ne.value.length); }
      }, 180);
    });
  }
};

function _contSearchMatch(s, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return (s || "").toString().toLowerCase().includes(q);
}
function _contRowMatchesSearch(r, q) {
  return _contSearchMatch(r.container, q) || _contSearchMatch(r.ssl, q) ||
         _contSearchMatch(r.loc, q) || _contSearchMatch(r.port, q) ||
         _contSearchMatch(r.vessel, q);
}

window.refreshContainers = function () {
  CONT_LAST_REFRESH = new Date();
  render();
  toast("EDI feed refreshed · no new events in last 60s.");
};
window.toggleDelivered = function () { CONT_EXPAND_DELIVERED = !CONT_EXPAND_DELIVERED; render(); };

function kpiTileV5(tone, label, value, sub) {
  const valStr = String(value);
  const cls = valStr.length > 8 ? "kpi-value tiny" : "kpi-value";
  return `
    <div class="kpi ${tone}">
      <div class="kpi-label">${h(label)}</div>
      <div class="${cls}">${valStr}</div>
      <div class="kpi-delta">${h(sub)}</div>
    </div>`;
}

// =================================================================
// PANEL 1 — Past LFD / Detention Accruing (CRITICAL — top of page)
// =================================================================
function panel1Html() {
  const q = (window.CONT_FILTERS && CONT_FILTERS.search) || "";
  // Build unified rows, sort by priority (urgency)
  const portRows = V5_PORT_PAST_LFD.map(r => ({
    kind: "port",
    container: r.container, ssl: r.ssl, stage: "Out-Gate Ready",
    cstatus: "Loaded", loc: r.port,
    days: `${r.daysPast}d past LFD`,
    daysPast: r.daysPast, accrued: r.accrued, daily: r.daily,
    action: r.action, btn: "Send Dispatch", carrier: r.carrier, lfd: r.lfd,
  }));
  const dcRows = V5_DC_DWELLING_EMPTY.map(r => ({
    kind: "dc",
    container: r.container, ssl: r.ssl, stage: "Delivered",
    cstatus: "Empty", loc: r.loc,
    days: `${r.daysDet}d detention`,
    daysPast: r.daysDet, accrued: r.accrued, daily: r.daily,
    action: r.action, btn: "Send Return",
  }));
  // Priority sort: largest accrued+1-day-cost first (urgency = exposure + immediacy)
  let all = [...portRows, ...dcRows].sort((a, b) =>
    (b.accrued + (b.daily || 0)) - (a.accrued + (a.daily || 0))
  );
  if (q) all = all.filter(r => _contRowMatchesSearch(r, q));
  if (q && all.length === 0) return "";
  const total = all.reduce((s, r) => s + r.accrued, 0);
  // Apply priority labels P1/P2/P3 in sorted order
  all.forEach((r, i) => { r.priority = i === 0 ? "P1" : (i === 1 ? "P2" : "P3+"); });
  // Tomorrow's projected exposure if no action taken (each container accrues another daily rate)
  const exposureNextDay = all.reduce((s, r) => s + (r.daily || 0), 0);
  // Estimated savings if all are dispatched today (avoid the next 24h accrual)
  const projectedSavings = exposureNextDay;

  return `
    <div class="card panel-crit" style="margin-bottom: 14px;">
      <div class="card-head">
        <div>
          <div class="card-title">Past LFD / Detention Accruing</div>
          <div class="card-sub">Port-side demurrage and DC-side detention shown together · sorted by $ exposure descending.</div>
        </div>
        <div><span class="pill crit">${all.length} accruing · ${fmt$(total)} today</span></div>
      </div>
      <div class="card-body tight">
        <table class="tbl">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Container</th><th>SSL</th><th>Stage</th><th>Status</th><th>Location</th>
              <th>Days past threshold</th><th class="num">$ Accrued</th><th class="num">+24h cost</th>
              <th>Recommended Action</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${all.map(r => `
              <tr class="clickable ${r.kind === "port" ? "crit-row" : "warn-row"}" onclick="navigate('containers/${h(r.container)}')">
                <td><span class="pill ${r.priority === 'P1' ? 'bad' : (r.priority === 'P2' ? 'warn' : 'neutral')}" style="font-weight:600;">${h(r.priority)}</span></td>
                <td class="mono"><b>${h(r.container)}</b></td>
                <td>${h(r.ssl)}</td>
                <td>${stagePill(r.stage)}</td>
                <td>${csTag(r.cstatus)}</td>
                <td>${h(r.loc)}</td>
                <td class="mono">${h(r.days)}</td>
                <td class="num ${r.kind === "port" ? "accrued-crit" : "accrued-warn"}">${fmt$0(r.accrued)}</td>
                <td class="num mono" style="color:#b91c1c;">+${fmt$0(r.daily || 0)}</td>
                <td>${h(r.action)}</td>
                <td>
                  <button class="btn sm" onclick="event.stopPropagation();${
                    r.kind === "port"
                      ? `openDispatchEmail('FB-${r.container.slice(-4)}','${h(r.container)}','${h(r.carrier)}')`
                      : `openReturnEmail('${h(r.container)}','${h(r.ssl)}')`
                  }">${h(r.btn)}</button>
                </td>
              </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="7" style="text-align:right;font-weight:600;">If all are dispatched today, projected 24h savings:</td>
              <td class="num" style="color:#166534;font-weight:700;">${fmt$0(projectedSavings)}</td>
              <td colspan="3" class="muted" style="font-size:11.5px;">avoided demurrage + detention at current ladder rates</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
}

// =================================================================
// PANEL 2 — Recommended Actions — Out-Gate Ready (safe LFD)
// =================================================================
function panel2Html() {
  const q = (window.CONT_FILTERS && CONT_FILTERS.search) || "";
  let rows = V5_OGR_SAFE;
  if (q) rows = rows.filter(r => _contRowMatchesSearch(r, q));
  if (q && rows.length === 0) return "";
  return `
    <div class="card" style="margin-bottom: 14px;">
      <div class="card-head">
        <div>
          <div class="card-title">Recommended Actions — Out-Gate Ready (safe LFD)</div>
          <div class="card-sub">Containers ready for dispatch with LFD not yet passed · sorted by days-to-LFD ascending.</div>
        </div>
        <div><span class="pill blue">${rows.length} containers</span></div>
      </div>
      <div class="card-body tight">
        <table class="tbl">
          <thead>
            <tr>
              <th>Container</th><th>SSL</th><th>Status</th><th>Location</th>
              <th>LFD</th><th>Days to LFD</th>
              <th>Recommended Action</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr class="clickable" onclick="navigate('containers/${h(r.container)}')">
                <td class="mono"><b>${h(r.container)}</b></td>
                <td>${h(r.ssl)}</td>
                <td>${csTag("Loaded")}</td>
                <td>${h(r.port)}</td>
                <td class="mono">${h(r.lfd)}</td>
                <td class="num">${r.daysToLfd}d</td>
                <td>${r.daysToLfd === 1 ? "LFD tomorrow — " : ""}${h(r.action)}</td>
                <td>
                  <button class="btn sm" onclick="event.stopPropagation();${
                    r.daysToLfd === 1
                      ? `openDispatchEmail('FB-${r.container.slice(-4)}','${h(r.container)}','${h(r.carrier)}')`
                      : `toast('Appointment slot opened.')`
                  }">${r.daysToLfd === 1 ? "Send Dispatch" : "Schedule"}</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

// =================================================================
// PANEL 3 — Pre-Arrival Pipeline (monitoring only)
// =================================================================
function panel3Html() {
  const q = (window.CONT_FILTERS && CONT_FILTERS.search) || "";
  let rows = V5_PIPELINE;
  if (q) rows = rows.filter(r => _contRowMatchesSearch(r, q));
  if (q && rows.length === 0) return "";
  const groups = {
    "Awaiting Discharge": rows.filter(r => r.stage === "Awaiting Discharge"),
    "In Customs":         rows.filter(r => r.stage === "In Customs"),
    "Awaiting Release":   rows.filter(r => r.stage === "Awaiting Release"),
  };
  const body = Object.entries(groups).map(([k, list]) => list.length ? `
    <div class="sub-h">${h(k)}<span class="count">${list.length}</span></div>
    <table class="tbl">
      <thead>
        <tr>
          <th>Container</th><th>SSL</th><th>Vessel</th><th>Origin port</th>
          <th>ETA</th><th>Equipment</th><th>Linked PO</th><th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(r => `
          <tr class="clickable" onclick="navigate('containers/${h(r.container)}')">
            <td class="mono"><b>${h(r.container)}</b></td>
            <td>${h(r.ssl)}</td>
            <td class="muted">${h(r.vessel)}</td>
            <td>${h(r.port)}</td>
            <td class="mono">${h(r.eta)}</td>
            <td>${h(r.equip)}</td>
            <td class="mono">${h(r.po)}</td>
            <td class="muted" style="font-size:11.5px;">${r.note}</td>
          </tr>`).join("")}
      </tbody>
    </table>` : "").join("");

  return `
    <div class="card" style="margin-bottom: 14px;">
      <div class="card-head">
        <div>
          <div class="card-title">Pre-Arrival Pipeline</div>
          <div class="card-sub">Monitoring only — no dispatch action available until container reaches Out-Gate Ready.</div>
        </div>
        <div><span class="pill blue">${rows.length} containers</span></div>
      </div>
      <div class="card-body tight" style="padding: 0;">
        ${body}
      </div>
    </div>`;
}

// =================================================================
// PANEL 4 — Delivered / Returned (collapsed by default)
// =================================================================
function panel4Html(delivered) {
  const synthReturned = [
    { container: "TCLU8801293", ssl: "TCLU", stage: "Delivered", cstatus: "Returned", loc: "NewAge Perris CA", lfd: "2026-05-08", pickup: "2026-05-09" },
    { container: "MAEU3329881", ssl: "Maersk", stage: "Delivered", cstatus: "Returned", loc: "NewAge Perris CA", lfd: "2026-05-09", pickup: "2026-05-10" },
    { container: "EVRU2418200", ssl: "Evergreen", stage: "Delivered", cstatus: "Returned", loc: "NewAge Monee IL",  lfd: "2026-05-10", pickup: "2026-05-11" },
  ];
  const deliveredRows = delivered.slice(0, 12).map(c => ({
    container: c["Container #"], ssl: c["Steamship Line"], stage: c.Stage,
    cstatus: containerStatusOf(c), loc: "NewAge Perris CA",
    lfd: c.LFD || "—", pickup: c["Pickup Date"] || "—",
  }));
  const q = (window.CONT_FILTERS && CONT_FILTERS.search) || "";
  let all = [...synthReturned, ...deliveredRows];
  if (q) all = all.filter(r => _contRowMatchesSearch(r, q));
  if (q && all.length === 0) return "";

  return `
    <div class="card" style="margin-bottom: 0;">
      <div class="card-head" style="cursor:pointer;" onclick="toggleDelivered()">
        <div>
          <div class="card-title">Delivered / Returned</div>
          <div class="card-sub">${all.length} completed loads · empty returned · click to ${CONT_EXPAND_DELIVERED ? "collapse" : "expand"}</div>
        </div>
        <div><span class="pill neutral">${CONT_EXPAND_DELIVERED ? "▼" : "▶"} ${all.length}</span></div>
      </div>
      ${CONT_EXPAND_DELIVERED ? `
      <div class="card-body tight">
        <table class="tbl">
          <thead>
            <tr><th>Container</th><th>SSL</th><th>Stage</th><th>Container Status</th><th>Location</th><th>LFD</th><th>Pickup</th></tr>
          </thead>
          <tbody>
            ${all.map(r => `
              <tr class="clickable" onclick="navigate('containers/${h(r.container)}')">
                <td class="mono"><b>${h(r.container)}</b></td>
                <td>${h(r.ssl)}</td>
                <td>${stagePill(r.stage)}</td>
                <td>${csTag(r.cstatus)}</td>
                <td>${h(r.loc)}</td>
                <td class="mono">${h(r.lfd)}</td>
                <td class="mono">${h(r.pickup)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : ""}
    </div>`;
}

// Email modal for empty returns (mirrors openDispatchEmail shape)
window.openReturnEmail = function (container, ssl) {
  const subject = `Empty return instruction — ${container} (${ssl})`;
  const body = `Hi ${ssl} Dispatch,

Please schedule pickup of empty container ${container} from NewAge Perris CA to halt detention accrual.

  Preferred:  Tomorrow ${tomorrow} 08:00–14:00.
  Return depot: ${ssl} preferred per routing guide.

Please confirm dispatch within 2 business hours.

Thanks,
James Tran
Inbound Freight Manager · NewAge Products
james.tran@newageproducts.com  ·  (951) 555-0118`;
  const dom = (ssl || "ssl").toLowerCase().replace(/\s+/g, "");

  openModal(el("div", { class: "modal" }, [
    el("div", { class: "modal-head" }, [
      el("h2", {}, [`Send empty return — ${container}`]),
      el("button", { class: "x-btn", onclick: closeModal }, ["×"]),
    ]),
    el("div", { class: "modal-body", html: `
      <label class="field"><span class="lbl">To</span><input class="txt" value="dispatch@${dom}.com"></label>
      <label class="field"><span class="lbl">Subject</span><input class="txt" value="${h(subject)}"></label>
      <label class="field"><span class="lbl">Body</span><textarea class="txt" rows="11">${h(body)}</textarea></label>
      ${emailActionsHtml({ to: `dispatch@${dom}.com`, subject, body, onSent: () => { closeModal(); toast(`Return instruction sent for ${container}`); } })}
    ` }),
    el("div", { class: "modal-foot" }, [
      el("button", { class: "btn secondary", onclick: closeModal }, ["Save draft"]),
    ]),
  ]));
};

window.toggleDelivered = function () { CONT_EXPAND_DELIVERED = !CONT_EXPAND_DELIVERED; render(); };

function kpiTile2(label, value, delta, dir) {
  const cls = String(value).length > 8 ? "kpi-value tiny" : "kpi-value";
  return `<div class="kpi"><div class="kpi-label">${h(label)}</div><div class="${cls}">${value}</div><div class="kpi-delta ${dir||""}">${h(delta)}</div></div>`;
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function outgateRow(c) {
  const d = daysBetween("2026-05-16", c.LFD);
  const risk = c["Demurrage Risk"];
  const ladder = D.perDiem.find(p => (p["Steamship Line"]||"").startsWith(c["Steamship Line"]));
  const day1 = ladder ? ladder["Demurrage Days 1–3 ($/day)"] : 275;
  let action, saved;
  if (/HIGH|CRITICAL/.test(risk)) {
    action = `Dispatch today at ITS Pier T (7 open slots, 08:00–10:00).`;
    saved = day1;
  } else {
    action = `Book Pier T appointment next Mon (4 open). Preventive.`;
    saved = 0;
  }
  return `
    <tr class="clickable" onclick="navigate('containers/${h(c["Container #"])}')">
      <td class="mono"><b>${h(c["Container #"])}</b></td>
      <td>${h(c["Steamship Line"])}</td>
      <td>${h(c["US Port"])} → ${h(c["Linked PO"] && c["Linked PO"].startsWith("NA") ? "NewAge DC" : "DC")}</td>
      <td class="mono">${h(c.LFD)}</td>
      <td class="num">${d == null ? "—" : d}d</td>
      <td>${riskPill(risk)}</td>
      <td>${h(action)}</td>
      <td class="num">${saved ? fmt$0(saved) : '<span class="muted-2">preventive</span>'}</td>
      <td><button class="btn sm" onclick="event.stopPropagation();openDispatchEmail('${h(c["Container #"])}','${h(c["Container #"])}','${h(c["Steamship Line"])}')">Take action ›</button></td>
    </tr>`;
}

function pipelineGroup(label, list) {
  if (!list.length) return "";
  return `
    <div class="sec-h">${h(label)} <span class="count">${list.length}</span></div>
    <div class="card" style="border-radius: 8px; box-shadow: none;">
      <div class="card-body tight">
        <table class="tbl">
          <thead>
            <tr><th>Container</th><th>SSL</th><th>Vessel</th><th>Origin</th><th>Discharge</th><th>Customs</th><th>SSL Released</th><th>Notes</th></tr>
          </thead>
          <tbody>
            ${list.map(c => `
              <tr class="clickable" onclick="navigate('containers/${h(c["Container #"])}')">
                <td class="mono"><b>${h(c["Container #"])}</b></td>
                <td>${h(c["Steamship Line"])}</td>
                <td class="muted">${h(c.Vessel)}</td>
                <td>${h(c["Origin Port"])}</td>
                <td class="mono">${h(c["Discharge Date"] || "—")}</td>
                <td>${customsPill(c["Customs Status"])}</td>
                <td>${c["SSL Released"] === "Yes" ? '<span class="pill ok">Yes</span>' : '<span class="pill warn">No</span>'}</td>
                <td class="muted" style="max-width: 320px;">${h(c.Notes || "")}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function riskPill(r) {
  if (!r || r === "—") return '<span class="pill neutral">—</span>';
  if (/CRIT/.test(r)) return '<span class="pill crit">CRITICAL</span>';
  if (/HIGH/.test(r)) return '<span class="pill high">HIGH</span>';
  if (/MED/.test(r)) return '<span class="pill med">MED</span>';
  if (/LOW/.test(r)) return '<span class="pill low">LOW</span>';
  return `<span class="pill neutral">${h(r)}</span>`;
}
function customsPill(s) {
  if (!s) return '<span class="muted">—</span>';
  if (s === "Cleared") return '<span class="pill ok">Cleared</span>';
  if (s === "Pending") return '<span class="pill neutral">Pending</span>';
  if (s.includes("CET")) return '<span class="pill warn">CET Exam</span>';
  if (s.includes("Document")) return '<span class="pill warn">Doc Hold</span>';
  return `<span class="pill warn">${h(s)}</span>`;
}

function renderContainerDetail(root, containerId) {
  const c = D.containers.find(x => x["Container #"] === containerId);
  if (!c) {
    const demoChips = (window.QUICK_START_DEMO_REFS || []).map(r =>
      `<a class="qs-chip" onclick="navigate('containers/${h(r.ref)}')"><span class="mono">${h(r.ref)}</span><span class="qs-chip-sub">${h(r.label)}</span></a>`).join("");
    root.innerHTML = `
      <div class="row" style="margin-bottom:14px;">
        <button class="btn secondary sm" onclick="navigate('containers')">← All containers</button>
      </div>
      <div class="card">
        <div class="card-body" style="padding:20px;">
          <h2 style="margin:0 0 8px;">Container <span class="mono">${h(containerId)}</span> isn't in this workspace</h2>
          <div class="muted" style="font-size:13px; margin-bottom:14px;">
            Maverick only knows about containers seeded into NewAge's mock dataset and the live-tracking demo refs.
            To see a full container detail view, pick one of the 5 demo references below — each shows real-shape carrier
            milestones, ETA, current location, and a linked drayage invoice.
          </div>
          <div class="qs-chips" style="margin-bottom:14px;">${demoChips}</div>
          <div class="muted" style="font-size:12px;">
            Want to track <span class="mono">${h(containerId)}</span> live? Open
            <a onclick="navigate('containers')">Containers</a> → click any demo ref → use the
            <b>Re-track</b> button on the Live tracking card with this number as the reference.
            (Requires <code>TRACKING_PROVIDER=shipsgo</code> or <code>hybrid</code> + a ShipsGo API key.)
          </div>
        </div>
      </div>`;
    return;
  }
  const inv = D.invoices.find(i => i["Container #"] === containerId);
  const po = D.pos.find(p => p["Container #"] === containerId);
  const showDispatch = c.Stage === "Out-Gate Ready" || /past LFD|missed/i.test(c.Notes || c["Demurrage Risk"] || "");
  const showReturn = c.Stage === "Delivered" && !(c.Status || "").includes("Returned");

  root.innerHTML = `
    <div class="row" style="margin-bottom:14px; justify-content: space-between;">
      <button class="btn secondary sm" onclick="navigate('containers')">← All containers</button>
      <div class="edi-note" title="Seeded EDI 315/322 timeline + live Terminal49 tracking below.">
        <span class="dot"></span>
        <span><b>Data source:</b> seeded EDI 315 / 322 events · <b>live Terminal49 tracking</b> in card below</span>
      </div>
    </div>

    <div class="banner ${stageBanner(c.Stage)}">
      <span class="banner-icon">${stageIcon(c.Stage)}</span>
      <div>
        <b>${h(c.Stage)}</b> · ${h(c.Status)}
        ${c.LFD ? `<br>LFD <span class="mono">${h(c.LFD)}</span> · Free time ${c["Free Time (days)"]} days · ${h(c["Steamship Line"])} ladder applies.` : ""}
      </div>
    </div>

    <div class="detail-header">
      <div>
        <h1>Container <span class="mono">${h(c["Container #"])}</span></h1>
        <div class="muted" style="font-size: 12.5px;">${h(c["Steamship Line"])} · ${h(c.Vessel)} · ${h(c.Equipment)} · ${h(c["Origin Port"])} → ${h(c["US Port"])}</div>
      </div>
      <div class="row">${stagePill(c.Stage)}${riskPill(c["Demurrage Risk"])}</div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="card-title">Milestone timeline</div></div>
          <div class="card-body" id="milestone-body" data-container="${h(c["Container #"])}">${milestones(c, inv || {})}</div>
        </div>

        <div class="card" id="t49-card">
          <div class="card-head">
            <div class="card-title">Live tracking · Terminal49</div>
            <button class="btn secondary sm" id="t49-refresh-btn" onclick="loadT49Card('${h(c["Container #"])}', {force:true})">Refresh</button>
          </div>
          <div class="card-body" id="t49-body">
            <div class="muted" style="font-size: 12.5px;">Loading…</div>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="card-title">References</div></div>
          <div class="card-body">
            <dl class="kv-grid">
              <dt>Linked load</dt><dd>${inv ? `<a onclick="navigate('loads/${h(inv["Invoice #"])}')" class="mono">${h(inv["FB# / Load ID"])}</a>` : "—"}</dd>
              <dt>Drayage invoice</dt><dd>${inv ? `<a onclick="navigate('invoices/drayage/${h(inv["Invoice #"])}')" class="mono">${h(inv["Invoice #"])}</a>` : "—"}</dd>
              <dt>Linked PO</dt><dd>${po ? `<span class="mono">${h(po["PO #"])}</span> · ${h(po["SKU Family"])}` : `<span class="muted">— no PO linked —</span>`}</dd>
              <dt>Customs entry</dt><dd>${customsForContainer(c["Container #"])}</dd>
              <dt>Customs status</dt><dd>${customsPill(c["Customs Status"])}</dd>
              <dt>SSL released</dt><dd>${c["SSL Released"] === "Yes" ? '<span class="pill ok">Yes</span>' : '<span class="pill warn">No</span>'}</dd>
              <dt>Demurrage risk</dt><dd>${riskPill(c["Demurrage Risk"])}</dd>
              <dt>Notes</dt><dd class="muted">${h(c.Notes || "—")}</dd>
            </dl>
          </div>
        </div>

        ${showDispatch ? `
        <div class="ai-card">
          <span class="ai-badge">AI</span>
          <div class="ai-title">Dispatch recommendation</div>
          <div class="ai-body" style="font-size: 12.5px;">
            ${typeof window.aiDispatchHtml === "function" ? window.aiDispatchHtml(c, inv || {}) : dispatchSuggestion(c)}
          </div>
          <div style="margin-top: 10px; display:flex; gap:8px;">
            <button class="btn" onclick="(function(){ const sel = (window._dispatchSelectedCarrier||{})['${h(c["Container #"])}']; openDispatchEmail('${h(inv ? inv["FB# / Load ID"] : c["Container #"])}','${h(c["Container #"])}', sel || '${h(c["Steamship Line"])}'); })()">Send dispatch instruction</button>
            <button class="btn secondary" onclick="navigate('ratecard')">Open rate card</button>
          </div>
        </div>` : ""}

        ${showReturn ? `
        <div class="ai-card">
          <span class="ai-badge">AI</span>
          <div class="ai-title">Empty return reminder</div>
          <div class="ai-body" style="font-size: 12.5px;">
            Return empty by <b>2026-05-21</b> to stop <b>$150/day</b> per-diem accrual at consignee (${h(c["Steamship Line"])} ladder).
          </div>
          <div style="margin-top: 10px;">
            <button class="btn" onclick="toast('Return instruction sent.')">Send return instruction</button>
          </div>
        </div>` : ""}

        ${!showDispatch && !showReturn && c.Stage !== "Delivered" ? `
        <div class="card">
          <div class="card-head"><div class="card-title">Recommendation</div></div>
          <div class="card-body" style="font-size: 12.5px;" class="muted">
            No action available — container is ${c.Stage.toLowerCase()}. Recommendations fire only on <b>Out-Gate Ready</b> or post-LFD.
          </div>
        </div>` : ""}
      </div>
    </div>
  `;

  loadT49Card(c["Container #"]);
}

function dispatchSuggestion(c) {
  const ladder = D.perDiem.find(p => (p["Steamship Line"]||"").startsWith(c["Steamship Line"]));
  const day1 = ladder ? ladder["Demurrage Days 1–3 ($/day)"] : 275;
  if (/HIGH|CRITICAL/.test(c["Demurrage Risk"] || "")) {
    return `Container is <b>Out-Gate Ready</b> with LFD <span class="mono">${h(c.LFD)}</span>. Dispatch today at <b>Long Beach — Pier T (ITS)</b>. Projected day-one savings: <b>${fmt$0(day1)}</b> at the ${h(c["Steamship Line"])} ladder.`;
  }
  if (/past LFD|missed/i.test(c.Notes || c["Demurrage Risk"] || "")) {
    return `Container picked up <b>2 days after LFD</b>. Demurrage of <b>${fmt$0(day1*1.5)}</b> already incurred. Review per-diem schedule next time.`;
  }
  return `Book Pier T appointment this week (4 open slots). Preventive — keeps comfortable buffer to LFD.`;
}

function customsForContainer(cont) {
  const e = D.customs.entries.find(x => x.container === cont);
  if (!e) return '<span class="muted">— no entry —</span>';
  return `<a class="mono" onclick="navigate('invoices/customs')">${h(e.entry)}</a>`;
}

function stageBanner(s) {
  if (s === "Out-Gate Ready") return "ok";
  if (s === "Delivered") return "info";
  if (s === "In Customs" || s === "Awaiting Release") return "warn";
  if (s === "Awaiting Discharge") return "info";
  return "info";
}
function stageIcon(s) {
  if (s === "Out-Gate Ready") return "🚢";
  if (s === "Delivered") return "📦";
  if (s === "In Customs") return "🛃";
  if (s === "Awaiting Release") return "⏳";
  if (s === "Awaiting Discharge") return "🌊";
  return "•";
}

// ---------- TRANSFERS ----------
ROUTES.transfers = function (root, sub) {
  if (sub) return renderTransferDetail(root, sub);

  const cols = [
    ["SUBMITTED", "Submitted"],
    ["APPROVED", "Approved"],
    ["DISPATCHED", "Dispatched"],
    ["IN TRANSIT", "In Transit"],
    ["COMPLETED", "Completed"],
  ];

  root.innerHTML = `
    <div class="page-title-row">
      <div>
        <h1 class="page-title">Transfers</h1>
        <div class="page-subtitle">Container-level transfers within NewAge's network. Inventory needs come from <b>P4 Warehouse</b>; Maverick adds the logistics layer.</div>
      </div>
      <div class="row">
        <button class="btn secondary">Import from P4</button>
        <button class="btn" onclick="openNewTransfer()">+ New Transfer</button>
      </div>
    </div>

    <div class="kanban">
      ${cols.map(([statusKey, label]) => {
        const cards = D.transfers.filter(t => (t.Status || "").toUpperCase() === statusKey);
        return `
          <div class="kan-col">
            <div class="kan-head">
              <div class="kan-title">${h(label)}</div>
              <div class="kan-count">${cards.length}</div>
            </div>
            <div class="kan-cards">
              ${cards.map(t => transferCard(t)).join("") || `<div class="empty" style="padding:20px 10px;">—</div>`}
            </div>
          </div>`;
      }).join("")}
    </div>
  `;
};

function transferCard(t) {
  const isCostco = /Costco/i.test(t["To DC"] || t["Costco PO Linked?"] || t.Notes || "");
  return `
    <div class="kan-card" onclick="navigate('transfers/${h(t["Transfer ID"])}')">
      <div class="kan-id">${h(t["Transfer ID"])}</div>
      <div class="kan-lane">${h(t["From DC"])} → ${h(t["To DC"])}</div>
      <div class="muted" style="font-size: 11.5px;">${h(t.Mode)} · ${h(t.Equipment)}</div>
      <div class="kan-meta">
        <div><span class="muted-2">SKU</span> ${h(t["SKU Family"])}</div>
        <div><span class="muted-2">Need-by</span> <span class="mono">${h(t["Need-By"])}</span></div>
        <div><span class="muted-2">Est cost</span> <span class="num">${fmt$0(t["Est. Cost (USD)"])}</span></div>
        ${isCostco ? '<div style="margin-top:4px;"><span class="pill warn">Costco compliance</span></div>' : ""}
      </div>
    </div>`;
}

// New transfer modal — multi-step with P4 picker (Step 0) then mode-dependent fields
const P4_REQUESTS = [
  { id: "P4-REQ-77419", from: "Perris CA",   to: "Monee IL (Costco)", sku: "Garage Cabinet — Pro 3.0 Series",  qty: 1200, needBy: "2026-05-23", costcoPO: "C-77419", reason: "Costco Naperville POG drop" },
  { id: "P4-REQ-77420", from: "Monee IL",    to: "Perris CA",         sku: "Outdoor Kitchen — SS Cabinet",      qty:  340, needBy: "2026-05-21", costcoPO: null,       reason: "Home Depot SoCal stockout" },
  { id: "P4-REQ-77421", from: "Perris CA",   to: "Monee IL",          sku: "BBQ Gas Grill — Platinum Series",   qty:  180, needBy: "2026-05-26", costcoPO: null,       reason: "Recall quarantine" },
  { id: "P4-REQ-77422", from: "LB Pier T",   to: "Monee IL",          sku: "Garage Cabinet — Pro 3.0 Series",   qty: 1400, needBy: "2026-05-24", costcoPO: null,       reason: "Direct import — bypass Perris" },
  { id: "P4-REQ-77423", from: "Perris CA",   to: "Monee IL",          sku: "Home Bar Cabinet — Maple Series",   qty:  420, needBy: "2026-05-28", costcoPO: null,       reason: "Network rebalance — forecasted demand" },
  { id: "P4-REQ-77424", from: "Perris CA",   to: "Monee IL (Costco)", sku: "Outdoor Heater — Patio Pro",        qty:  260, needBy: "2026-05-30", costcoPO: "C-77424", reason: "Costco Glenview drop" },
  { id: "P4-REQ-77425", from: "Monee IL",    to: "Perris CA",         sku: "Garage Workbench — Workstream",     qty:  140, needBy: "2026-05-25", costcoPO: null,       reason: "Network rebalance" },
];

let NEW_T = { step: 0, mode: "rail", selectedP4: new Set(["P4-REQ-77419"]) };
window.openNewTransfer = function () {
  NEW_T = {
    step: 0, mode: "rail",
    selectedP4: new Set(["P4-REQ-77419"]),
    carrier: "BNSF", pickup: "2026-05-19", delivery: "2026-05-22", equipRef: "",
  };
  showNewTransferModal();
};

function p4PickerHtml() {
  return `
    <div class="banner info" style="margin-bottom: 10px;">
      <span class="banner-icon">📥</span>
      <div>Pending transfer needs pulled from <b>P4 Warehouse</b>. Pick one or more to fulfill in this transfer — multiple lines are valid when SKUs co-load on the same trailer / container.</div>
    </div>
    <div class="p4-list">
      <div class="p4-row head">
        <div></div>
        <div>P4 Request ID</div>
        <div>Origin DC</div>
        <div>Destination</div>
        <div>SKU Family</div>
        <div class="num">Qty</div>
        <div>Need-By</div>
        <div>Reason / PO ref</div>
      </div>
      ${P4_REQUESTS.map(r => {
        const sel = NEW_T.selectedP4.has(r.id);
        return `
        <div class="p4-row ${sel ? 'selected' : ''}" onclick="toggleP4('${r.id}')">
          <div><input type="checkbox" ${sel ? 'checked' : ''} onclick="event.stopPropagation();toggleP4('${r.id}')"></div>
          <div class="mono">${h(r.id)}</div>
          <div>${h(r.from)}</div>
          <div>${h(r.to)}</div>
          <div>${h(r.sku)}</div>
          <div class="num">${r.qty.toLocaleString()}</div>
          <div class="mono">${h(r.needBy)}</div>
          <div class="reason">${r.costcoPO ? `<span class="costco">Costco PO ${h(r.costcoPO)}</span> · ` : ''}${h(r.reason)}</div>
        </div>`;
      }).join("")}
    </div>
    <div class="muted-2" style="font-size: 11.5px; margin-top: 8px;">
      ${NEW_T.selectedP4.size} request${NEW_T.selectedP4.size === 1 ? '' : 's'} selected. Continue to <b>Step 1 · Source</b> to confirm aggregated fields.
    </div>
  `;
}

window.toggleP4 = function (id) {
  if (NEW_T.selectedP4.has(id)) NEW_T.selectedP4.delete(id);
  else NEW_T.selectedP4.add(id);
  showNewTransferModal();
};
window.goNewTransferStep = function (n) {
  NEW_T.step = n;
  showNewTransferModal();
};

function aggregateSelection() {
  const sel = P4_REQUESTS.filter(r => NEW_T.selectedP4.has(r.id));
  if (sel.length === 0) return null;
  const from = [...new Set(sel.map(r => r.from))];
  const to   = [...new Set(sel.map(r => r.to))];
  const sku  = sel.map(r => `${r.sku} (${r.qty})`).join("; ");
  const qty  = sel.reduce((s, r) => s + r.qty, 0);
  const needBy = sel.map(r => r.needBy).sort()[0];
  const costcoPOs = sel.filter(r => r.costcoPO).map(r => r.costcoPO);
  const reasons = [...new Set(sel.map(r => r.reason))];
  return { from, to, sku, qty, needBy, costcoPOs, reasons,
           reason: reasons.length === 1 ? reasons[0] : "Mixed",
           selectedCount: sel.length };
}

function showNewTransferModal() {
  const agg = aggregateSelection();
  const step = NEW_T.step;
  const m = NEW_T.mode;
  const isCostco = agg && (agg.costcoPOs.length > 0 || agg.to.some(t => /Costco/i.test(t)));
  const isCrossDC = agg && agg.from.length > 1;
  const canAdvance = step === 0 ? (agg && agg.selectedCount > 0) :
                     step === 1 ? (agg && agg.to.length === 1) :  // to-DC must match
                     true;

  const stepperHtml = `
    <div class="row" style="gap: 6px; margin-bottom: 14px; flex-wrap: wrap;">
      ${[
        ["0", "Select P4 requests"],
        ["1", "Source (read-only)"],
        ["2", "Logistics"],
        ["3", "Compliance & submit"],
      ].map(([n, label]) => `
        <button class="btn ${parseInt(n) === step ? '' : 'secondary'} sm" onclick="goNewTransferStep(${n})">
          <span class="step-pill" style="background: ${parseInt(n) === step ? '#fff' : 'var(--brand)'}; color: ${parseInt(n) === step ? 'var(--brand)' : '#fff'};">${n}</span>
          ${label}
        </button>
        ${n < 3 ? '<span class="muted-2" style="font-size: 11px;">→</span>' : ''}
      `).join("")}
    </div>`;

  let bodyHtml = "";

  if (step === 0) {
    bodyHtml = p4PickerHtml();
  } else if (step === 1) {
    if (!agg) { bodyHtml = `<div class="empty">No P4 requests selected. Go back to Step 0.</div>`; }
    else {
      const destMismatch = agg.to.length > 1;
      bodyHtml = `
        <div class="banner ${destMismatch ? 'warn' : 'info'}" style="margin-bottom:10px;">
          <span class="banner-icon">${destMismatch ? '⚠' : 'ℹ'}</span>
          <div>
            ${destMismatch
              ? `<b>Destination mismatch.</b> Selected P4 requests have different destinations (${agg.to.join(", ")}). Go back and pick requests with the same destination DC.`
              : `Aggregated from <b>${agg.selectedCount}</b> P4 request${agg.selectedCount > 1 ? 's' : ''} — these fields are read-only.`}
          </div>
        </div>
        <div class="grid-2" style="gap:14px;">
          <label class="field"><span class="lbl">From DC</span><input class="txt" value="${h(agg.from.join(" / "))}" disabled></label>
          <label class="field"><span class="lbl">To DC</span><input class="txt" value="${h(agg.to.join(" / "))}" disabled></label>
        </div>
        <label class="field"><span class="lbl">Combined SKU summary</span><textarea class="txt" rows="3" disabled>${h(agg.sku)}</textarea></label>
        <div class="grid-2" style="gap:14px;">
          <label class="field"><span class="lbl">Total quantity (units)</span><input class="txt num" value="${agg.qty.toLocaleString()}" disabled></label>
          <label class="field"><span class="lbl">Earliest need-by</span><input class="txt mono" value="${h(agg.needBy)}" disabled></label>
        </div>
        ${agg.costcoPOs.length ? `
          <label class="field"><span class="lbl">Costco 850 PO(s)</span><input class="txt mono" value="${h(agg.costcoPOs.join(", "))}" disabled></label>
        ` : ""}
        <label class="field"><span class="lbl">Reason code (auto-derived)</span><input class="txt" value="${h(agg.reason)}" disabled></label>
      `;
    }
  } else if (step === 2) {
    const modeFields = m === "cross" ? `
      <label class="field"><span class="lbl">Ocean Container # (required)</span>
        <select class="txt" onchange="NEW_T.equipRef=this.value">
          <option value="">— Select container at source port —</option>
          <option ${NEW_T.equipRef==='ONEU5559528'?'selected':''} value="ONEU5559528">ONEU5559528 · 40HC · LB Pier T · Cleared</option>
          <option value="OOLU2287405">OOLU2287405 · 40HC · LB Pier T · Out-Gate Ready</option>
          <option value="HMMU7714203">HMMU7714203 · 40HC · LA · Awaiting Release</option>
        </select>
        <div class="hint" style="font-size:11px;color:var(--text-3);margin-top:4px;">Pulled from containers at source port not yet dispatched.</div>
      </label>` : `
      <label class="field"><span class="lbl">Domestic Equipment Reference (optional)</span>
        <input class="txt" placeholder="${m === 'rail' ? "53' IM container, e.g. EMHU2241095" : "53' trailer #, e.g. KNXC298401"}" value="${h(NEW_T.equipRef||'')}" oninput="NEW_T.equipRef=this.value">
        <div class="hint" style="font-size:11px;color:var(--text-3);margin-top:4px;">Equipment is owned by the carrier; this field is for your tracking only.</div>
      </label>`;

    const carrierOpts = m === "rail"
      ? `<option>BNSF</option><option>UP / BNSF</option><option>CSX</option>`
      : m === "tl"
        ? `<option>Knight-Swift</option><option>Schneider</option><option>JB Hunt</option><option>Werner</option>`
        : `<option>Pacific Coastline Drayage</option><option>West Coast Container Express</option><option>SoCal Drayage Solutions</option>`;

    bodyHtml = `
      <div class="grid-2" style="gap:18px;">
        <div>
          <label class="field"><span class="lbl">Mode</span>
            <select class="txt" onchange="NEW_T.mode=this.value;showNewTransferModal()">
              <option value="rail" ${m==='rail'?'selected':''}>(a) DC-to-DC · 53' Intermodal Rail</option>
              <option value="tl"   ${m==='tl'?'selected':''}>(b) DC-to-DC · 53' TL Dry Van</option>
              <option value="cross" ${m==='cross'?'selected':''}>(c) Port-Direct Cross-Dock · 40' Ocean Container</option>
            </select>
          </label>
          ${modeFields}
          <label class="field"><span class="lbl">Carrier (ranked)</span>
            <select class="txt">${carrierOpts}</select>
          </label>
          <div class="row" style="gap:10px;">
            <label class="field" style="flex:1;"><span class="lbl">Pickup window</span><input type="date" class="txt" value="${NEW_T.pickup}"></label>
            <label class="field" style="flex:1;"><span class="lbl">Delivery window</span><input type="date" class="txt" value="${NEW_T.delivery}"></label>
          </div>
          <label class="field"><span class="lbl">Reason code ${agg && agg.reasons.length > 1 ? '<span class="muted-2" style="font-size:11px;">— Mixed (multiple P4 reasons)</span>' : ''}</span>
            <input class="txt" value="${h(agg ? agg.reason : "rebalance")}" disabled>
          </label>
        </div>
        <div>
          <div class="sec-h">Carrier comparison <span class="count">— ranked for this lane</span></div>
          <div class="carrier-row selected" style="grid-template-columns: 1fr 60px 50px;">
            <div><div class="c-name">${m==='rail'?'BNSF':m==='tl'?'Knight-Swift':'Pacific Coastline'}</div><div class="c-meta">Tier · Primary</div></div>
            <div class="num">${fmt$0(m==='rail'?3850:m==='tl'?4200:535)}</div>
            <div class="num">96%</div>
          </div>
          <div class="carrier-row" style="grid-template-columns: 1fr 60px 50px;">
            <div><div class="c-name">${m==='rail'?'UP / BNSF':m==='tl'?'Schneider':'West Coast Container'}</div><div class="c-meta">Tier · Backup</div></div>
            <div class="num">${fmt$0(m==='rail'?3950:m==='tl'?4150:510)}</div>
            <div class="num">92%</div>
          </div>
          <div class="carrier-row" style="grid-template-columns: 1fr 60px 50px;">
            <div><div class="c-name">${m==='rail'?'CSX':m==='tl'?'JB Hunt':'SoCal Drayage'}</div><div class="c-meta">Tier · Spot</div></div>
            <div class="num">${fmt$0(m==='rail'?4100:m==='tl'?4350:580)}</div>
            <div class="num">87%</div>
          </div>
          <div class="banner info" style="margin-top:10px; font-size: 11.5px;">
            <span class="banner-icon">💡</span>
            <div>Choosing <b>${m==='rail'?'UP / BNSF':m==='tl'?'Schneider':'West Coast Container'}</b> saves <b>${fmt$0(m==='rail'?-100:m==='tl'?50:25)}/move</b> vs Primary; scorecard 92% (vs 96%).</div>
          </div>
        </div>
      </div>
    `;
  } else if (step === 3) {
    const blockSubmit = isCostco && agg && agg.costcoPOs.length === 0;
    bodyHtml = `
      <div class="grid-2" style="gap:14px;">
        <div class="card">
          <div class="card-head"><div class="card-title">Summary</div></div>
          <div class="card-body">
            <dl class="kv-grid">
              <dt>P4 requests</dt><dd class="mono">${agg ? [...NEW_T.selectedP4].join(", ") : "—"}</dd>
              <dt>Lane</dt><dd>${agg ? agg.from.join("/")+" → "+agg.to.join("/") : "—"}</dd>
              <dt>Mode</dt><dd>${m==='rail'?"53' Intermodal Rail":m==='tl'?"53' TL Dry Van":"Port-Direct Cross-Dock 40' Ocean"}</dd>
              <dt>Total qty</dt><dd class="num">${agg ? agg.qty.toLocaleString() : "—"} units</dd>
              <dt>Need-by</dt><dd class="mono">${agg ? agg.needBy : "—"}</dd>
              <dt>Carrier</dt><dd>${m==='rail'?'BNSF':m==='tl'?'Knight-Swift':'Pacific Coastline Drayage'}</dd>
              <dt>Pickup window</dt><dd class="mono">${NEW_T.pickup}</dd>
              <dt>Delivery window</dt><dd class="mono">${NEW_T.delivery}</dd>
            </dl>
          </div>
        </div>
        <div>
          ${isCostco ? `
          <div class="banner warn">
            <span class="banner-icon">⚠</span>
            <div>
              <b>Costco DC destination — verify before submit:</b>
              <ul class="check-list">
                <li class="${agg.costcoPOs.length ? 'done' : ''}">
                  <span class="cb">${agg.costcoPOs.length ? '✓' : ''}</span>
                  850 PO matched: ${agg.costcoPOs.length ? `<span class="mono">${h(agg.costcoPOs.join(", "))}</span>` : '<b style="color:#B41C1C;">REQUIRED — none on file</b>'}
                </li>
                <li><span class="cb"></span>856 ASN to be generated post-dispatch</li>
                <li><span class="cb"></span>CHEP four-way pallets</li>
                <li><span class="cb"></span>≤60in stack height</li>
                <li><span class="cb"></span>SSCC-18 / GS1-128 labels</li>
              </ul>
              ${blockSubmit ? `<div style="margin-top: 8px; padding: 8px 10px; background: #FCE5E5; border-radius: 6px; color: #791F1F; font-size: 11.5px;"><b>Submission blocked</b> — Costco destination requires a matched 850 PO before dispatch.</div>` : ''}
            </div>
          </div>
          ` : `
          <div class="banner info">
            <span class="banner-icon">ℹ</span>
            <div>This transfer's destination is not a Costco DC — no special compliance check required.</div>
          </div>
          `}
        </div>
      </div>`;
    NEW_T.blockSubmit = !!blockSubmit;
  }

  // Foot buttons
  const isLast = step === 3;
  const isFirst = step === 0;
  const submitDisabled = NEW_T.blockSubmit && isLast;

  openModal(el("div", { class: "modal wide" }, [
    el("div", { class: "modal-head" }, [
      el("h2", { html: `New Transfer ${agg ? `<span class="muted-2" style="font-size:13px;font-weight:400;">— ${agg.selectedCount} P4 request${agg.selectedCount > 1 ? 's' : ''} selected · ${agg.qty.toLocaleString()} units</span>` : ''}` }),
      el("button", { class: "x-btn", onclick: closeModal }, ["×"]),
    ]),
    el("div", { class: "modal-body", html: stepperHtml + bodyHtml }),
    el("div", { class: "modal-foot" }, [
      el("button", { class: "btn secondary", onclick: closeModal }, ["Cancel"]),
      el("span", { class: "spacer", style: "flex:1;" }),
      !isFirst ? el("button", { class: "btn secondary", onclick: () => goNewTransferStep(step - 1) }, ["← Back"]) : null,
      !isLast ? el("button", { class: "btn", onclick: () => canAdvance && goNewTransferStep(step + 1), disabled: !canAdvance ? "disabled" : false }, ["Next →"])
              : el("button", { class: "btn", disabled: submitDisabled ? "disabled" : false, onclick: () => {
                  if (submitDisabled) return;
                  closeModal();
                  toast(`Transfer submitted — ${agg.selectedCount} P4 line${agg.selectedCount > 1 ? 's' : ''}${isCostco ? ' · Costco 850 matched' : ''}.`);
                } }, [`Submit transfer${isCostco && !submitDisabled ? " · 850 matched" : ""}`]),
    ].filter(Boolean)),
  ]));
}

function renderTransferDetail(root, transferId) {
  const t = D.transfers.find(x => x["Transfer ID"] === transferId);
  if (!t) { root.innerHTML = `<div class="empty"><strong>Transfer not found</strong></div>`; return; }
  const isCostco = /Costco|Naperville/.test(t["To DC"] || t["Costco PO Linked?"] || "");
  const status = (t.Status || "").toUpperCase();
  const stateOrder = ["SUBMITTED","APPROVED","DISPATCHED","IN TRANSIT","COMPLETED","RECONCILED"];
  const currIdx = stateOrder.indexOf(status);

  const variance = t["Actual Cost (USD)"] && t["Actual Cost (USD)"] > 0 ? (t["Actual Cost (USD)"] - t["Est. Cost (USD)"]) : null;
  const variancePct = variance != null ? (variance / t["Est. Cost (USD)"] * 100) : null;

  root.innerHTML = `
    <div class="row" style="margin-bottom:14px;">
      <button class="btn secondary sm" onclick="navigate('transfers')">← All transfers</button>
    </div>

    ${isCostco ? `
      <div class="banner warn">
        <span class="banner-icon">⚠</span>
        <div>
          <b>Costco DC destination — verify before dispatch:</b>
          <ul class="check-list">
            <li class="done"><span class="cb">✓</span>850 PO matched: <span class="mono">${h((t["Costco PO Linked?"] || "").replace("Yes — ", ""))}</span></li>
            <li><span class="cb"></span>856 ASN to be generated post-dispatch</li>
            <li><span class="cb"></span>CHEP four-way pallets</li>
            <li><span class="cb"></span>≤60in stack height</li>
            <li><span class="cb"></span>SSCC-18 / GS1-128 labels</li>
          </ul>
        </div>
      </div>` : ""}

    <div class="detail-header">
      <div>
        <h1>Transfer <span class="mono">${h(t["Transfer ID"])}</span></h1>
        <div class="muted" style="font-size: 12.5px;">${h(t["From DC"])} → ${h(t["To DC"])} · ${h(t.Mode)} · ${h(t.Equipment)}</div>
      </div>
      <div class="row">${stateBadge(status)}</div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="card-title">Approval state machine</div></div>
          <div class="card-body">
            <div class="timeline">
              ${stateOrder.map((s, i) => `
                <div class="mile ${i < currIdx ? 'done' : i === currIdx ? 'curr' : 'pending'}">
                  <div class="mile-label">${h(s.charAt(0) + s.slice(1).toLowerCase())}</div>
                  <div class="mile-meta">${i === currIdx ? "current" : i < currIdx ? "completed" : "pending"}</div>
                </div>`).join("")}
            </div>
          </div>
        </div>

        ${status === "COMPLETED" || status === "RECONCILED" ? `
        <div class="card">
          <div class="card-head"><div class="card-title">Reconciliation</div>${variance != null && Math.abs(variancePct) > 2 ? '<span class="pill warn">Variance flag</span>' : ''}</div>
          <div class="card-body">
            <dl class="kv-grid">
              <dt>Estimated cost</dt><dd class="num"><b>${fmt$(t["Est. Cost (USD)"])}</b></dd>
              <dt>Actual cost</dt><dd class="num"><b>${fmt$(t["Actual Cost (USD)"])}</b></dd>
              <dt>Variance</dt><dd class="num"><b class="${variance>0?'red':'green'}">${variance>0?'+':''}${fmt$(variance||0)}</b> (${(variancePct||0).toFixed(1)}%)</dd>
            </dl>
          </div>
        </div>` : ""}
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="card-title">References</div></div>
          <div class="card-body">
            <dl class="kv-grid">
              <dt>SKU family</dt><dd>${h(t["SKU Family"])}</dd>
              <dt>Reason</dt><dd>${h(t.Reason)}</dd>
              <dt>Equipment</dt><dd class="mono">${h(t["Container #"] || "—")}</dd>
              <dt>Need-by</dt><dd class="mono">${h(t["Need-By"])}</dd>
              <dt>Est. cost</dt><dd class="num"><b>${fmt$(t["Est. Cost (USD)"])}</b></dd>
              <dt>Requested by</dt><dd>${h(t["Requested By"])}</dd>
              <dt>Approved by</dt><dd>${h(t["Approved By"])}</dd>
              <dt>Costco PO?</dt><dd>${h(t["Costco PO Linked?"] || "No")}</dd>
              <dt>Notes</dt><dd class="muted">${h(t.Notes || "—")}</dd>
            </dl>
          </div>
        </div>

        ${["APPROVED","DISPATCHED"].includes(status) ? `
        <div class="ai-card">
          <span class="ai-badge">AI</span>
          <div class="ai-title">Suggested next step</div>
          <div class="ai-body" style="font-size: 12.5px;">
            Ready to dispatch. Send instruction to <b>${h(t.Mode.includes("Rail")?"BNSF":t.Mode.includes("TL")?"Knight-Swift":"Pacific Coastline")}</b>.
          </div>
          <div style="margin-top:10px;">
            <button class="btn" onclick="openDispatchEmail('${h(t["Transfer ID"])}', '${h(t["Container #"] || 'pallets')}', '${h(t.Mode.includes('Rail')?'BNSF':t.Mode.includes('TL')?'Knight-Swift':'Pacific Coastline')}')">Send dispatch instruction</button>
          </div>
        </div>` : ""}

        ${status === "IN TRANSIT" ? `
        <div class="card">
          <div class="card-head"><div class="card-title">In-transit tracking</div></div>
          <div class="card-body">
            <div class="timeline">
              <div class="mile done"><div class="mile-label">Pickup</div><div class="mile-meta">${h(t["Need-By"])}</div></div>
              <div class="mile curr"><div class="mile-label">In Transit</div><div class="mile-meta">en route</div></div>
              <div class="mile pending"><div class="mile-label">Delivered</div><div class="mile-meta">est ${h(t["Need-By"])}</div></div>
            </div>
          </div>
        </div>` : ""}
      </div>
    </div>
  `;
}

function stateBadge(s) {
  const m = {
    SUBMITTED: '<span class="pill draft">Submitted</span>',
    APPROVED: '<span class="pill blue">Approved</span>',
    DISPATCHED: '<span class="pill med">Dispatched</span>',
    "IN TRANSIT": '<span class="pill warn">In Transit</span>',
    COMPLETED: '<span class="pill ok">Completed</span>',
    RECONCILED: '<span class="pill ok">Reconciled</span>',
  };
  return m[s] || `<span class="pill neutral">${h(s)}</span>`;
}

window.kpiTile2 = kpiTile2;
window.riskPill = riskPill;
window.customsPill = customsPill;
window.stateBadge = stateBadge;

// ============================================================
// Terminal49 — live container tracking UI
// ============================================================
const T49_SCAC_OPTIONS = [
  { code: "MAEU", label: "Maersk" },
  { code: "MSCU", label: "MSC" },
  { code: "HLCU", label: "Hapag-Lloyd" },
  { code: "ONEY", label: "ONE" },
  { code: "CMDU", label: "CMA CGM" },
  { code: "HDMU", label: "HMM" },
  { code: "OOLU", label: "OOCL" },
  { code: "YMLU", label: "Yang Ming" },
  { code: "COSU", label: "COSCO" },
  { code: "EGLV", label: "Evergreen" },
  { code: "ZIMU", label: "ZIM" },
];

const T49_PREFIX_TO_SCAC = {
  MSCU: "MSCU", MSDU: "MSCU", MEDU: "MSCU",
  MAEU: "MAEU", MSKU: "MAEU", MRKU: "MAEU", MWCU: "MAEU",
  HLCU: "HLCU", HLBU: "HLCU", HLXU: "HLCU",
  ONEU: "ONEY", ONEJ: "ONEY", NYKU: "ONEY", KKLU: "ONEY", KOCU: "ONEY",
  CMAU: "CMDU", CMDU: "CMDU",
  HMMU: "HDMU", HDMU: "HDMU",
  OOLU: "OOLU", OOCU: "OOLU",
  YMLU: "YMLU", YMMU: "YMLU",
  COSU: "COSU", CBHU: "COSU",
  EGHU: "EGLV", EGSU: "EGLV",
  ZIMU: "ZIMU", ZCSU: "ZIMU",
  TLLU: "",  // Triton leasing — no carrier guess; user picks
};

function _t49GuessScac(ref) {
  const p = (ref || "").substring(0, 4).toUpperCase();
  return T49_PREFIX_TO_SCAC[p] || "";
}

// Returns { request_type, scac, ready } — `ready` means we can auto-fire
// without prompting the user (both request_type and scac are confident).
function _t49InferTracking(ref) {
  const v = (ref || "").trim().toUpperCase();
  const isContainer = /^[A-Z]{4}\d{7}$/.test(v);
  const scac = _t49GuessScac(v);
  return {
    request_type: isContainer ? "container" : "bill_of_lading",
    scac,
    ready: !!scac,
  };
}

const T49_POLL_STATES = new Set(["created", "pending", "awaiting_manifest", "tracking_warning"]);

async function loadT49Card(containerNo, opts) {
  const body = document.getElementById("t49-body");
  if (!body) return;
  const force = !!(opts && opts.force);
  if (force) {
    body.innerHTML = `<div class="muted" style="font-size:12.5px;">Refreshing from Terminal49…</div>`;
  }
  try {
    const url = `/api/containers/${encodeURIComponent(containerNo)}/tracking${force ? "?force=true" : ""}`;
    const resp = await fetch(url);
    const data = await resp.json();
    renderT49State(containerNo, data);
    // Drive the seeded milestone timeline from live data when present
    _syncMilestoneTimeline(containerNo, data.milestones);
  } catch (e) {
    body.innerHTML = `<div class="pill bad">Tracking error</div>
      <div style="font-size:12.5px; margin-top:6px;">${h(String(e && e.message || e))}</div>`;
  }
}

function _syncMilestoneTimeline(containerNo, liveMilestones) {
  const host = document.getElementById("milestone-body");
  if (!host || host.dataset.container !== containerNo) return;
  const D = window.DATA;
  const cont = (D.containers || []).find(c => c["Container #"] === containerNo);
  const inv = (D.invoices || []).find(i => i["Container #"] === containerNo) || {};
  if (!cont) return;
  host.innerHTML = window.milestones(cont, inv, liveMilestones);
}

function renderT49State(containerNo, data) {
  const body = document.getElementById("t49-body");
  if (!body) return;

  if (data && data.t49_configured === false) {
    body.innerHTML = `
      <div class="pill warn" style="margin-bottom:8px;">Not configured</div>
      <div class="muted" style="font-size:12.5px;">Server is missing the <code>TERMINAL49_API_TOKEN</code> env var. Set it in Render dashboard and redeploy.</div>`;
    return;
  }

  if (!data || data.status === "not_tracked") {
    const inferred = _t49InferTracking(containerNo);
    // Auto-fire tracking when we can infer SCAC + type confidently
    if (inferred.ready && data && data.t49_configured) {
      body.innerHTML = `<div class="muted" style="font-size:12.5px;">Submitting to Terminal49 (${h(inferred.scac)} · ${h(inferred.request_type)})…</div>`;
      startT49Tracking(containerNo, { scac: inferred.scac, request_type: inferred.request_type, request_number: containerNo, silent: true });
      return;
    }
    const opts = T49_SCAC_OPTIONS.map(o =>
      `<option value="${h(o.code)}" ${o.code === inferred.scac ? "selected" : ""}>${h(o.code)} — ${h(o.label)}</option>`
    ).join("");
    body.innerHTML = `
      <div class="muted" style="font-size:12.5px; margin-bottom:10px;">
        No live tracking yet. Submit to Terminal49 to pull real ocean carrier milestones.
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
        <label style="display:flex; flex-direction:column; font-size:11.5px; color:#666;">Carrier (SCAC)
          <select id="t49-scac" style="margin-top:2px;">${opts}</select>
        </label>
        <label style="display:flex; flex-direction:column; font-size:11.5px; color:#666;">Reference type
          <select id="t49-type" style="margin-top:2px;">
            <option value="container" ${inferred.request_type === "container" ? "selected" : ""}>Container #</option>
            <option value="bill_of_lading" ${inferred.request_type === "bill_of_lading" ? "selected" : ""}>Master BOL</option>
            <option value="booking_number">Booking #</option>
          </select>
        </label>
        <label style="display:flex; flex-direction:column; font-size:11.5px; color:#666;">Reference value
          <input id="t49-number" type="text" value="${h(containerNo)}" style="margin-top:2px; width:180px;">
        </label>
        <button class="btn sm" onclick="startT49Tracking('${h(containerNo)}')">Start tracking</button>
      </div>`;
    return;
  }

  if (data.status === "duplicate_read_blocked") {
    body.innerHTML = `
      <div class="pill warn" style="margin-bottom:8px;">Token scope</div>
      <div style="font-size:12.5px; margin-bottom:6px;">Terminal49 confirms this reference is already being tracked, but the API token lacks <b>read scope</b>, so milestones cannot be fetched.</div>
      <div class="muted" style="font-size:11.5px;">Tracking request ID: <span class="mono">${h(data.tracking_request_id || "—")}</span></div>
      <div class="muted" style="font-size:11.5px; margin-top:8px;">Fix: <a href="https://app.terminal49.com" target="_blank" rel="noopener">app.terminal49.com</a> → Developer Portal → re-issue the token with read+write scopes, then update <code>TERMINAL49_API_TOKEN</code>.</div>`;
    return;
  }

  if (data.status === "error") {
    body.innerHTML = `
      <div class="pill bad" style="margin-bottom:8px;">Error</div>
      <div style="font-size:12.5px;">${h(data.error || "Unknown error")}</div>
      <div style="margin-top:10px;"><button class="btn secondary sm" onclick="resetT49Tracking('${h(containerNo)}')">Try again</button></div>`;
    return;
  }

  const pending = T49_POLL_STATES.has(data.status);
  const milestones = (data.milestones || []).slice().reverse();
  // Current event = most recent ACTUAL event (fall back to most recent of any kind)
  const currentEvent = milestones.find(m => m.actual !== false) || milestones[0] || null;
  const headerBg = pending ? "background:#fff7ed;border:1px solid #fed7aa;"
                          : "background:#ecfdf5;border:1px solid #a7f3d0;";
  body.innerHTML = `
    <div style="padding:10px 12px; border-radius:8px; margin-bottom:10px; ${headerBg}">
      <div class="row" style="justify-content:space-between; align-items:flex-start; gap:12px;">
        <div style="min-width:0;">
          <div class="muted" style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Current event</div>
          <div style="font-size:14px; font-weight:600; margin-top:2px;">
            ${h((currentEvent && currentEvent.event) || (pending ? "Awaiting carrier response…" : "—"))}
          </div>
          ${currentEvent && currentEvent.timestamp ? `<div class="mono" style="font-size:11.5px; color:#555;">${h(currentEvent.timestamp)}${currentEvent.actual === false ? ' <span class="pill warn" style="margin-left:4px;">est.</span>' : ""}</div>` : ""}
        </div>
        <div style="min-width:0;">
          <div class="muted" style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Current location</div>
          <div style="font-size:14px; font-weight:600; margin-top:2px;">${h((currentEvent && currentEvent.location) || "—")}</div>
        </div>
        <div style="min-width:0; text-align:right;">
          <div class="muted" style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">ETA · ${h(data.pod_name || "POD")}</div>
          <div class="mono" style="font-size:14px; font-weight:600; margin-top:2px;">${h(data.pod_eta || "—")}</div>
        </div>
      </div>
    </div>
    <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:8px;">
      <div class="row" style="gap:6px;">
        ${pending ? `<span class="pill warn">${h(data.status)}</span>` : `<span class="pill ok">${h(data.status)}</span>`}
        ${data.scac ? `<span class="pill neutral mono">${h(data.scac)}</span>` : ""}
      </div>
      <div class="muted" style="font-size:11.5px;">
        ${data.shipment_id ? `T49 shipment <span class="mono">${h(data.shipment_id)}</span>` : (data.tracking_request_id ? `Request <span class="mono">${h(data.tracking_request_id)}</span>` : "")}
        ${data.updated_at ? ` · ${h(data.updated_at)}` : ""}
      </div>
    </div>
    ${pending ? `<div class="muted" style="font-size:12px; margin-bottom:8px;">Polling Terminal49… milestones appear once the carrier responds (usually under a minute).</div>` : ""}
    ${milestones.length ? `
      <div>
        ${milestones.map(m => `
          <div class="row" style="justify-content:space-between; padding:6px 0; border-bottom:1px solid #eef0f2;">
            <div>
              <b style="font-size:12.5px;">${h(m.event || "—")}</b>
              <span class="muted" style="font-size:11.5px; margin-left:6px;">${h(m.location || "")}</span>
              ${m.actual === false ? `<span class="pill warn" style="margin-left:6px;">est.</span>` : ""}
            </div>
            <div class="mono" style="font-size:11.5px;">${h(m.timestamp || "")}</div>
          </div>`).join("")}
      </div>` : `<div class="muted" style="font-size:12px;">No events yet.</div>`}
    <div style="margin-top:10px; display:flex; gap:8px;">
      <button class="btn secondary sm" onclick="loadT49Card('${h(containerNo)}', {force:true})">Refresh</button>
      <button class="btn secondary sm" onclick="resetT49Tracking('${h(containerNo)}')">Re-track</button>
    </div>`;

  if (pending) {
    setTimeout(() => loadT49Card(containerNo, {force: true}), 5000);
  }
}

async function startT49Tracking(containerNo, opts) {
  const body = document.getElementById("t49-body");
  let scac, request_type, request_number, silent;
  if (opts) {
    scac = opts.scac; request_type = opts.request_type;
    request_number = opts.request_number || containerNo;
    silent = !!opts.silent;
  } else {
    const scacEl = document.getElementById("t49-scac");
    const typeEl = document.getElementById("t49-type");
    const numEl  = document.getElementById("t49-number");
    if (!scacEl || !typeEl || !numEl) return;
    scac = scacEl.value;
    request_type = typeEl.value;
    request_number = numEl.value || containerNo;
    silent = false;
  }
  if (body && !silent) {
    body.innerHTML = `<div class="muted" style="font-size:12.5px;">Submitting to Terminal49…</div>`;
  }
  try {
    const resp = await fetch(`/api/containers/${encodeURIComponent(containerNo)}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scac, request_type, request_number }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      if (body) {
        body.innerHTML = `
          <div class="pill bad" style="margin-bottom:8px;">Failed</div>
          <div style="font-size:12.5px;">${h(data.error || ("HTTP " + resp.status))}</div>
          <div style="margin-top:10px;"><button class="btn secondary sm" onclick="resetT49Tracking('${h(containerNo)}')">Back</button></div>`;
      }
      return;
    }
    if (!silent) toast(`Terminal49 request submitted (${data.status})`);
    loadT49Card(containerNo);
  } catch (e) {
    if (body) {
      body.innerHTML = `<div class="pill bad">Network error</div>
        <div style="font-size:12.5px; margin-top:6px;">${h(String(e && e.message || e))}</div>`;
    }
  }
}

async function resetT49Tracking(containerNo) {
  const body = document.getElementById("t49-body");
  if (body) body.innerHTML = `<div class="muted" style="font-size:12.5px;">Clearing tracking record…</div>`;
  try {
    await fetch(`/api/containers/${encodeURIComponent(containerNo)}/tracking`, { method: "DELETE" });
  } catch (e) { /* non-fatal */ }
  // Clear the seeded timeline too so it doesn't keep showing live-derived state
  _syncMilestoneTimeline(containerNo, null);
  // Reload — backend now reports not_tracked, which triggers auto-inference
  loadT49Card(containerNo);
}

window.loadT49Card = loadT49Card;
window.startT49Tracking = startT49Tracking;
window.resetT49Tracking = resetT49Tracking;
