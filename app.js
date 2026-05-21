// Maverick — app.js (router, helpers, dashboard, load visibility)
"use strict";

const D = window.DATA;

// ============================================================
// Demo seeding — real ocean shipment refs that resolve via Terminal49
// (added in-memory so they appear on the Containers / Load Visibility pages
// alongside the seeded mock data — clicking them auto-fires T49 tracking)
// ============================================================
(function seedT49DemoRefs() {
  if (!D || !D.containers) return;
  // Each entry seeds: 1 container (for Container page) + 1 invoice (for Load Visibility / Load Detail)
  const DEMO_REFS = [
    { num: "CMDUSHZ7959898", line: "CMA CGM",      vessel: "CMA CGM AMERIGO VESPUCCI",
      origin: "Shanghai, China",  port: "Long Beach, CA",  lfd: "2026-05-30",
      load_id: "PCD25052601", invoice_no: "PCD-INV-99101", bol: "CMDUSHZ7959898",
      carrier: "Pacific Coastline Drayage Inc.", linehaul: 575, fsc_amt: 126.5, acc: 30, total: 731.5,
      stage: "Awaiting Discharge", risk: "LOW",
      status: "PENDING REVIEW",   note: "Demo · CMA CGM master BOL — live Terminal49" },
    { num: "TLLU4779831", line: "Hapag-Lloyd", vessel: "AL JMELIYAH",
      origin: "Hamburg, Germany", port: "New York, NY",   lfd: "2026-06-02",
      load_id: "PCD25052602", invoice_no: "PCD-INV-99102", bol: "HLCUHAM2407123",
      carrier: "East Coast Container Logistics", linehaul: 685, fsc_amt: 150.7, acc: 0, total: 835.7,
      stage: "Awaiting Discharge", risk: "LOW",
      status: "PENDING REVIEW",   note: "Demo · TLLU container — live Terminal49" },
    { num: "ZCSU7238990", line: "ZIM", vessel: "ZIM USA",
      origin: "Yantian, China",   port: "New York, NY",   lfd: "2026-06-04",
      load_id: "PCD25052603", invoice_no: "PCD-INV-99103", bol: "ZIMUSHA9384721",
      carrier: "East Coast Container Logistics", linehaul: 695, fsc_amt: 152.9, acc: 0, total: 847.9,
      stage: "Awaiting Discharge", risk: "LOW",
      status: "PENDING REVIEW",   note: "Demo · ZIM container — live Terminal49" },
    { num: "NYKU0776734", line: "ONE", vessel: "ONE COMMITMENT",
      origin: "Yokohama, Japan",  port: "Tacoma, WA",     lfd: "2026-05-28",
      load_id: "PCD25052604", invoice_no: "PCD-INV-99104", bol: "ONEYTYO00772841",
      carrier: "Pacific Coastline Drayage Inc.", linehaul: 615, fsc_amt: 135.3, acc: 30, total: 780.3,
      stage: "Awaiting Discharge", risk: "LOW",
      status: "PENDING REVIEW",   note: "Demo · NYK (now ONE) ref — live Terminal49" },
    { num: "KOCU4970299", line: "K Line", vessel: "ONE TRUST",
      origin: "Busan, South Korea", port: "Long Beach, CA", lfd: "2026-05-23",
      load_id: "PCD25052605", invoice_no: "PCD-INV-99105", bol: "ONEYPUS00497029",
      carrier: "Pacific Coastline Drayage Inc.", linehaul: 545, fsc_amt: 119.9, acc: 85, total: 749.9,
      stage: "Out-Gate Ready",   risk: "MEDIUM",
      status: "PENDING REVIEW",   note: "Demo · K Line ref — live Terminal49 · LFD imminent" },
  ];

  const existingContainers = new Set(D.containers.map(c => c["Container #"]));
  const existingInvoices = new Set((D.invoices || []).map(i => i["Invoice #"]));
  D.invoices = D.invoices || [];

  DEMO_REFS.forEach((r, idx) => {
    if (!existingContainers.has(r.num)) {
      D.containers.push({
        "Container #": r.num,
        "Steamship Line": r.line,
        "Vessel": r.vessel,
        "Equipment": "40HC",
        "Origin Port": r.origin,
        "US Port": r.port,
        "Discharge Date": "",
        "Customs Status": "Pending",
        "SSL Released": "No",
        "LFD": r.lfd,
        "Pickup Date": "",
        "Free Time (days)": 7,
        "Stage": r.stage,
        "Demurrage Risk": r.risk,
        "Status": r.status,
        "Linked PO": "",
        "Notes": r.note,
        "_demo": true,
      });
    }
    if (!existingInvoices.has(r.invoice_no)) {
      D.invoices.push({
        "#": 9100 + idx,
        "Invoice #":         r.invoice_no,
        "Carrier":           r.carrier,
        "Invoice Date":      "2026-05-20",
        "FB# / Load ID":     r.load_id,
        "Container #":       r.num,
        "BOL/MBL #":         r.bol,
        "Origin":            r.origin,
        "Destination":       r.port + " — NewAge DC",
        "Equipment":         "40HC",
        "Linehaul (USD)":    r.linehaul,
        "FSC %":             "22%",
        "FSC (USD)":         r.fsc_amt,
        "Accessorials (USD)": r.acc,
        "Grand Total (USD)": r.total,
        "Status":            r.status,
        "Audit Finding":     "—",
        "_demo":             true,
      });
    }
  });
})();

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return n;
};
const h = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt$ = (n, opts = {}) => {
  if (n == null || n === "" || isNaN(n)) return opts.dash ? "—" : "$0";
  const v = Number(n);
  const negative = v < 0;
  const out = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: opts.cents !== false ? 2 : 0, maximumFractionDigits: 2 });
  return (negative ? "-" : "") + "$" + out;
};
const fmt$0 = (n) => fmt$(n, { cents: false });
const today = "2026-05-19"; // anchor "today" (Tue 19 May 2026)
const tomorrow = "2026-05-20";

// ---------- Nav structure (v4 spec, 7 sections) ----------
const NAV = [
  { id: "dashboard", icon: "🏠", label: "Dashboard" },
  {
    id: "loadmgmt", icon: "📦", label: "Load Management", expandable: true,
    children: [
      { id: "loads", label: "Load Visibility" },
      { id: "transfers", label: "Transfer Request" },
    ],
    defaultChild: "loads",
  },
  { id: "containers", icon: "🚢", label: "Containers" },
  {
    id: "invoices", icon: "🧾", label: "Invoice Management", expandable: true,
    children: [
      { id: "invoices/drayage", label: "Drayage Invoice" },
      { id: "invoices/customs", label: "Customs Invoice" },
      { id: "invoices/gl", label: "GL Reconciliation" },
    ],
    defaultChild: "invoices/drayage",
  },
  { id: "ratecard", icon: "🤝", label: "Rate Card" },
  { id: "report", icon: "📈", label: "Report" },
  { id: "users", icon: "👥", label: "Users" },
];

let currentRoute = "dashboard";
let expanded = new Set(["loadmgmt", "invoices"]); // start with these open

function inGroup(item, route) {
  if (item.children) return item.children.some(c => c.id === route || route.startsWith(c.id + "/"));
  return false;
}

function buildNav() {
  const nav = $("#nav");
  nav.innerHTML = "";
  for (const item of NAV) {
    const isActive = currentRoute === item.id || (item.children && inGroup(item, currentRoute));
    const isOpen = expanded.has(item.id) || (item.children && inGroup(item, currentRoute));
    const row = el("div", {
      class: `nav-item ${isActive && !item.expandable ? "active" : ""} ${item.expandable && isOpen ? "expanded" : ""}`,
      onclick: () => {
        if (item.expandable) {
          if (expanded.has(item.id)) expanded.delete(item.id); else expanded.add(item.id);
          buildNav();
        } else {
          navigate(item.id);
        }
      },
    }, [
      el("span", { class: "nav-icon", html: item.icon }),
      el("span", {}, [item.label]),
      item.expandable ? el("span", { class: "nav-caret", html: "▶" }) : null,
    ].filter(Boolean));
    nav.appendChild(row);
    if (item.children) {
      const sub = el("div", { class: "nav-children", style: isOpen ? "display:block" : "" });
      for (const c of item.children) {
        sub.appendChild(el("div", {
          class: `nav-child ${currentRoute === c.id || currentRoute.startsWith(c.id + "/") ? "active" : ""}`,
          onclick: () => navigate(c.id),
        }, [c.label]));
      }
      nav.appendChild(sub);
    }
  }
}

function navigate(route) {
  currentRoute = route;
  window.location.hash = route;
  render();
}

function render() {
  buildNav();
  const [main, ...rest] = currentRoute.split("/");
  const sub = rest.join("/");
  const content = $("#content");
  content.innerHTML = "";
  $("#crumbs").innerHTML = buildCrumbs(currentRoute);

  const handler = ROUTES[main] || ROUTES.dashboard;
  handler(content, sub);
  window.scrollTo(0, 0);
}

function buildCrumbs(route) {
  const map = {
    "dashboard": "Dashboard",
    "loads": "Load Management · Load Visibility",
    "transfers": "Load Management · Transfer Request",
    "containers": "Containers",
    "invoices/drayage": "Invoice Management · Drayage Invoice",
    "invoices/customs": "Invoice Management · Customs Invoice",
    "invoices/gl": "Invoice Management · GL Reconciliation",
    "ratecard": "Rate Card",
    "report": "Report · Carrier Scorecard",
    "users": "Users",
  };
  const base = route.split("/").slice(0, 2).join("/");
  const label = map[base] || map[route.split("/")[0]] || "Dashboard";
  const parts = route.split("/");
  let deep = "";
  if (parts.length > 2 || (parts.length === 2 && !map[base])) {
    deep = ` <span class="muted-2"> / </span> <span class="mono">${h(parts.slice(parts[0]==="invoices"?2:1).join("/"))}</span>`;
  }
  return `<strong>${h(label)}</strong>${deep}`;
}

// ---------- Modals & drawers ----------
function openModal(node) {
  const root = $("#modal-root");
  root.innerHTML = "";
  const backdrop = el("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === backdrop) closeModal(); } }, [node]);
  root.appendChild(backdrop);
}
function closeModal() { $("#modal-root").innerHTML = ""; }
function openDrawer(node) {
  const root = $("#drawer-root");
  root.innerHTML = "";
  root.appendChild(node);
}
function closeDrawer() { $("#drawer-root").innerHTML = ""; }

// ---------- Severity helpers ----------
function severityRank(s) { return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[s] || 0; }
function pill(severity, label) {
  const cls = { CRITICAL: "crit", HIGH: "high", MEDIUM: "med", LOW: "low" }[severity] || "neutral";
  return `<span class="pill ${cls}">${h(label || severity)}</span>`;
}
function stagePill(stage) {
  const cls = (stage || "Delivered").replace(/[\s/]/g, "-").replace(/[^A-Za-z-]/g, "");
  return `<span class="stage-tag stage-${cls}">${h(stage)}</span>`;
}

// ---------- Audit lookup ----------
const auditByInv = Object.fromEntries(D.audit.map(a => [a["Invoice #"], a]));

// ---------- Carrier short codes ----------
const CARRIER_SHORT = {
  "Pacific Coastline Drayage Inc.": "PCD",
  "Pacific Coastline Drayage": "PCD",
  "Continental Drayage Solutions, Llc": "CDS",
  "Continental Drayage Solutions": "CDS",
  "Atlantic Container Services, Inc.": "ACS",
  "Atlantic Container Services": "ACS",
  "Atlantic Heavy Drayage": "AHD",
  "West Coast Container Express": "WCE",
  "SoCal Drayage Solutions": "SDS",
  "Pacific Northwest Trucking": "PNT",
  "EastBound Logistics": "EBL",
  "Midwest Drayage Group": "MDG",
  "Cascade Container Lines": "CCL",
  "Maersk Store Door": "MSD",
  "ONE Line Carrier Haulage": "ONE-DRY",
  "BNSF Logistics IM": "BNSF",
};

// ---------- Carrier scorecard (16 carriers; composite 58–93 per spec) ----------
// composite = 0.30*OTP + 0.25*OTD + 0.20*IAcc + 0.15*(100-Acc%) + 0.10*DispWin
function comp(p) {
  return Math.round(p.otp*0.30 + p.otd*0.25 + p.iacc*0.20 + (100-p.acc)*0.15 + p.dispute*0.10);
}
const SCORECARD_RAW = {
  PCD: { name: "Pacific Coastline Drayage",   type: "Third-Party", otp: 92, otd: 94, iacc: 88, acc: 14, dispute: 76 },
  CDS: { name: "Continental Drayage Solutions",type: "Third-Party", otp: 89, otd: 91, iacc: 92, acc: 9,  dispute: 71 },
  ACS: { name: "Atlantic Container Services",  type: "Third-Party", otp: 94, otd: 93, iacc: 90, acc: 11, dispute: 80 },
  WCE: { name: "West Coast Container Express", type: "Third-Party", otp: 82, otd: 80, iacc: 84, acc: 18, dispute: 65 },
  SDS: { name: "SoCal Drayage Solutions",      type: "Premium",     otp: 94, otd: 95, iacc: 93, acc: 7,  dispute: 82 },
  PNT: { name: "Pacific Northwest Trucking",   type: "Third-Party", otp: 91, otd: 90, iacc: 93, acc: 7,  dispute: 74 },
  EBL: { name: "EastBound Logistics",          type: "Third-Party", otp: 88, otd: 89, iacc: 91, acc: 10, dispute: 72 },
  MDG: { name: "Midwest Drayage Group",        type: "Third-Party", otp: 87, otd: 88, iacc: 90, acc: 12, dispute: 70 },
  CCL: { name: "Cascade Container Lines",      type: "Third-Party", otp: 86, otd: 86, iacc: 88, acc: 12, dispute: 68 },
  AHD: { name: "Atlantic Heavy Drayage",       type: "Third-Party", otp: 84, otd: 85, iacc: 86, acc: 14, dispute: 64 },
  RWS: { name: "Reliable West Drayage",        type: "Third-Party", otp: 89, otd: 88, iacc: 91, acc: 10, dispute: 73 },
  HBS: { name: "Harbor Bound Services",        type: "Premium",     otp: 93, otd: 94, iacc: 94, acc: 7,  dispute: 79 },
  GST: { name: "Gulf States Trucking",         type: "Third-Party", otp: 85, otd: 87, iacc: 89, acc: 12, dispute: 67 },
  MSD: { name: "Maersk Store Door",            type: "Ocean Carrier Dray", otp: 62, otd: 64, iacc: 72, acc: 28, dispute: 45 },
  ONE: { name: "ONE Line Carrier Haulage",     type: "Ocean Carrier Dray", otp: 66, otd: 68, iacc: 74, acc: 24, dispute: 48 },
  BNS: { name: "BNSF Logistics IM",            type: "Rail Carrier Dray",  otp: 70, otd: 72, iacc: 80, acc: 18, dispute: 55 },
};
const SCORECARD = {};
for (const [k, v] of Object.entries(SCORECARD_RAW)) {
  SCORECARD[k] = { ...v, composite: comp(v), overall: comp(v) };
}

// ---------- Lane criticality inference ----------
function laneCriticality(origin, dest) {
  // HIGH: primary West Coast → Perris/Monee lanes
  const isHotLane = /Long Beach|Los Angeles|Pier T|Pier 400/i.test(origin || "");
  const isPrimaryDC = /Perris|Monee/i.test(dest || "");
  if (isHotLane && isPrimaryDC) return "HIGH";
  // MEDIUM: secondary West Coast / NE lanes
  if (/Tacoma|Oakland|Seattle|Newark|Norfolk|Charleston/i.test(origin || "") && isPrimaryDC) return "MEDIUM";
  // LOW: backhauls, spot lanes
  return "LOW";
}

// ---------- Carrier ranking algorithm (v4 spec) ----------
function rankCarriersForLane(origin, destination, equipment, criticality) {
  const crit = criticality || laneCriticality(origin, destination);
  // Find candidate lanes from rate card
  const candidates = D.rateCard.filter(r =>
    r.Carrier && SCORECARD[Object.entries(SCORECARD_RAW).find(([k,v]) => v.name === r.Carrier)?.[0]] &&
    (r["Destination DC"] === destination) &&
    (equipment ? r.Equipment === equipment : true)
  );

  // Always seed Maersk Store Door (ocean carrier dray) for LB→Perris as the "cheap but unreliable" decoy
  const decoys = [];
  if (/Long Beach.*Pier T/i.test(origin) && /Perris/i.test(destination)) {
    decoys.push({
      "Lane ID": "RC-WC-901", "Carrier": "Maersk Store Door",
      "Origin Port/Terminal": "Long Beach — Pier T", "Destination DC": "NewAge Perris CA",
      "Equipment": equipment || "40HC", "Base Rate (USD)": 430, "FSC %": "20%",
      "Tier": "Spot", "Notes": "Bundled with ocean tender — cheap but unreliable",
    });
  }

  // Filter to specific origin if given
  let pool = candidates.filter(r => !origin || r["Origin Port/Terminal"] === origin);
  if (pool.length === 0) pool = candidates;
  pool = pool.concat(decoys);

  // Annotate with scorecard
  const codeFor = (name) => Object.entries(SCORECARD_RAW).find(([k,v]) => v.name === name)?.[0];
  const rows = pool.map(r => {
    const code = codeFor(r.Carrier);
    const s = SCORECARD[code] || { composite: 65, type: "Third-Party", name: r.Carrier };
    return {
      laneId: r["Lane ID"],
      carrier: r.Carrier,
      code,
      type: s.type,
      rate: r["Base Rate (USD)"],
      composite: s.composite,
      tier: r.Tier,
      notes: r.Notes,
      capacity: 8 + (s.composite > 85 ? 2 : -2),
    };
  });

  // Floors per criticality
  const floor = crit === "HIGH" ? 85 : crit === "MEDIUM" ? 78 : 0;
  // Weight: HIGH 70/30, MEDIUM 50/50, LOW 30/70 (composite vs cost-inverted)
  const W = crit === "HIGH" ? { c: 0.70, $: 0.30 } : crit === "MEDIUM" ? { c: 0.50, $: 0.50 } : { c: 0.30, $: 0.70 };
  const minRate = Math.min(...rows.map(r => r.rate));
  const maxRate = Math.max(...rows.map(r => r.rate));
  const norm = (rate) => maxRate === minRate ? 100 : 100 * (maxRate - rate) / (maxRate - minRate);

  for (const r of rows) {
    r.eligible = r.composite >= floor;
    r.score = r.composite * W.c + norm(r.rate) * W.$;
  }
  // Sort: eligible first by score desc; excluded by composite desc
  const eligible = rows.filter(r => r.eligible).sort((a, b) => b.score - a.score);
  const excluded = rows.filter(r => !r.eligible).sort((a, b) => b.composite - a.composite);

  // Mark recommended (cheapest eligible)
  if (eligible.length) {
    const cheapest = eligible.slice().sort((a, b) => a.rate - b.rate)[0];
    cheapest.recommended = true;
  }
  return { eligible, excluded, criticality: crit, floor, weights: W };
}

function carrierTypeTag(t) {
  const cls = t === "Premium" ? "premium" : t === "Ocean Carrier Dray" ? "ocean" : t === "Rail Carrier Dray" ? "rail" : "tp";
  const label = t === "Third-Party" ? "Third-Party" : t === "Premium" ? "Premium" : t === "Ocean Carrier Dray" ? "Ocean Dray" : t === "Rail Carrier Dray" ? "Rail Dray" : t;
  return `<span class="ctype ${cls}">${h(label)}</span>`;
}

// ---------- Container location synth ----------
function containerLocation(c) {
  if (!c) return "—";
  const st = c.Stage;
  if (st === "Awaiting Discharge") return `On vessel — ${c.Vessel || ""}`;
  if (st === "In Customs") return `${c["US Port"]} — CBP hold`;
  if (st === "Awaiting Release") return `${c["US Port"]} — SSL hold`;
  if (st === "Out-Gate Ready") return `${c["US Port"]} — terminal`;
  if (st === "Delivered") return `At consignee — NewAge ${(c.Status || "").includes("Returned") ? "Perris CA" : "DC"}`;
  return "—";
}

// ---------- Routes ----------
const ROUTES = {};

// ============================================================
// DASHBOARD
// ============================================================
ROUTES.dashboard = function (root) {
  const C = D.containers;
  const outgateReady = C.filter(c => c.Stage === "Out-Gate Ready");
  const pastLFD = C.filter(c => c.LFD && c.LFD < today && (c.Stage === "Out-Gate Ready" || (c["Pickup Date"] && c["Pickup Date"] > c.LFD)));
  const totalAtRisk = D.audit.reduce((s, a) => s + (a["$ Impact (USD)"] || 0), 0);
  const detentionOver2 = 3; // synthetic — DC detention >2 days

  root.innerHTML = `
    <div class="page-title-row">
      <div>
        <h1 class="page-title">Good morning, James</h1>
        <div class="page-subtitle">Tuesday, 19 May 2026 · Week 21 · ${D.invoices.length} invoices in this week's audit batch.</div>
      </div>
      <div class="row">
        <button class="btn secondary">Export brief (PDF)</button>
      </div>
    </div>

    <div class="kpi-grid">
      ${kpiTile("Total loads today", 14, "9 inbound · 5 transfer")}
      ${kpiTile("Units past LFD", pastLFD.length || 1, "ONEU0091872 · demurrage accruing")}
      ${kpiTile("Detention > 2 days at DC", detentionOver2, "Perris: 2 · Monee: 1")}
      ${kpiTile("Active invoices this week", D.invoices.length, "+8 vs last wk")}
      ${kpiTile("Open audit exceptions", D.audit.length, "Across 7 rule families")}
      ${kpiTile("$ at risk", fmt$(totalAtRisk), "Recoverable on dispute")}
    </div>

    <div class="grid-2-wide" style="margin-bottom: 14px;">
      <div class="ai-card">
        <span class="ai-badge">AI</span>
        <div class="ai-title">AI Exception Summary</div>
        <div class="ai-body">
          <ul>
            <li><b>${fmt$(totalAtRisk)}</b> at risk across <b>10 findings</b> in this week's audit batch — top three drive 74% of exposure.</li>
            <li><b>PCD-INV-50016</b> stacks <b>five accessorials on one FB#</b> ($750, 137% of base) — <b>HIGH</b> excess_accessorial; needs IFM review before pay.</li>
            <li><b>Container ONEU0091872 / PCD-INV-50025</b>: $375 demurrage already billed (picked up 2 days after LFD). Dispatch reordering by EOD tomorrow prevents recurrence.</li>
            <li><b>ACS-INV-21003</b>: TONU $295 charged with no dispatch log on file — conditional dispute draftable.</li>
            <li>Two rate_variance findings ($90 each) across <b>PCD &amp; CDS</b> — same rule, different lanes. Auto-drafts ready.</li>
          </ul>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-title">Recommended Actions</div><div class="card-sub">Ranked by severity, then $ saved</div></div>
        <div class="card-body" style="padding: 12px 14px;">
          <div class="reco-list">
            ${recoCard("CRITICAL", "ONEU0091872 · PCD-INV-50025",
              "Past LFD — demurrage accruing.",
              "Dispatch today at ITS Pier T to stop $375 day-2 demurrage at ONE ladder.",
              "containers/ONEU0091872")}
            ${recoCard("HIGH", "OOLU2287405 · Out-Gate Ready",
              "Dispatch by EOD tomorrow — LFD 2026-05-18.",
              "Book Pier T 08:00–10:00 slot — saves $250 day-one demurrage (OOCL).",
              "containers/OOLU2287405")}
            ${recoCard("MEDIUM", "PCD-INV-50006 · rate_variance",
              "Dispute $90 rate variance.",
              "Linehaul $625 vs rate card $535 (cheapest eligible: WCE $510).",
              "invoices/drayage/PCD-INV-50006")}
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 14px;">
      <div class="card-head"><div class="card-title">Reminders · Tasks</div><div class="card-sub">Stage 2 dispatch flow · pre-arrival forecasts and ready-to-outgate review</div></div>
      <div class="reminders">
        ${reminderRow("📧", "Send Refined Pre-Arrival List to PCD",
          "Vessel MSC INGRID docks Thu 2026-05-21 (2 days out) · 6 containers in pipeline",
          "Due tomorrow", true,
          "openPreArrivalForecast('PCD', 'MSC INGRID', '2026-05-21')")}
        ${reminderRow("📧", "Send Refined Pre-Arrival List to CDS",
          "Vessel ONE OLYMPUS docks Sat 2026-05-23 (4 days out) · 4 containers in pipeline",
          "Due in 2 days", false,
          "openPreArrivalForecast('CDS', 'ONE OLYMPUS', '2026-05-23')")}
        ${reminderRow("📦", "5 containers Ready-to-Outgate this week",
          "Review dispatch queue · 2 HIGH / 3 MEDIUM risk on the per-diem ladder",
          "Due today", true,
          "navigate('loads')")}
        ${reminderRow("🧾", "GL period close 2026-05",
          "Demurrage account 5225 has $375 unaccrued — Finance escalation",
          "Due 2026-05-31", false,
          "navigate('invoices/gl')")}
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><div class="card-title">Exceptions by rule family</div></div>
        <div class="card-body"><div class="chart-wrap"><canvas id="chart-rules"></canvas></div></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Spend by carrier — this week</div><div class="card-sub mono">$38,847.14 total</div></div>
        <div class="card-body"><div class="chart-wrap"><canvas id="chart-spend"></canvas></div></div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const ruleCounts = {};
    for (const a of D.audit) ruleCounts[a["Rule Family"]] = (ruleCounts[a["Rule Family"]] || 0) + 1;
    const families = ["rate_variance", "fsc_math_error", "excess_accessorial", "duplicate_charge", "missing_po", "demurrage_risk", "detention_review", "waiting_time_review", "tonu_review"];
    new Chart($("#chart-rules"), {
      type: "bar",
      data: { labels: families, datasets: [{ data: families.map(f => ruleCounts[f] || 0), backgroundColor: "#0C447C", borderRadius: 3, barThickness: 22 }] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#475569", font: { size: 10 }, autoSkip: false, maxRotation: 40, minRotation: 40 }, grid: { display: false } },
          y: { ticks: { color: "#475569", precision: 0, stepSize: 1 }, grid: { color: "rgba(15,23,42,0.06)" }, beginAtZero: true },
        },
      },
    });

    new Chart($("#chart-spend"), {
      type: "doughnut",
      data: {
        labels: ["PCD — $22,650", "CDS — $8,328", "ACS — $7,870"],
        datasets: [{ data: [22649.74, 8327.60, 7869.80], backgroundColor: ["#0C447C", "#3F8AC8", "#A6C8E6"], borderWidth: 0 }],
      },
      options: { maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", labels: { boxWidth: 10, color: "#475569", font: { size: 11 } } } } },
    });
  }, 30);
};

function kpiTile(label, value, delta, target) {
  const valStr = String(value);
  const cls = valStr.length > 8 ? "kpi-value tiny" : "kpi-value";
  // Route Dashboard KPI cards to filtered views (BUG-6).
  const route = target || _kpiRoute(label);
  const clickable = route ? `style="cursor:pointer;" onclick="navigate('${route}')"` : "";
  return `
    <div class="kpi" ${clickable}>
      <div class="kpi-label">${h(label)}</div>
      <div class="${cls}">${valStr}</div>
      <div class="kpi-delta">${h(delta)}</div>
    </div>`;
}
function _kpiRoute(label) {
  const l = String(label || "").toLowerCase();
  if (l.includes("$ at risk") || l.includes("audit exception")) return "invoices/drayage";
  if (l.includes("past lfd") || l.includes("detention")) return "containers";
  if (l.includes("active invoice")) return "invoices/drayage";
  if (l.includes("total loads")) return "loads";
  return null;
}
function recoCard(sev, ref, action, reason, target) {
  const cls = { CRITICAL: "crit", HIGH: "high", MEDIUM: "med" }[sev];
  return `
    <div class="reco ${cls}">
      <div>${pill(sev)}</div>
      <div class="reco-main">
        <div class="reco-action">${h(action)}</div>
        <div class="reco-reason"><span class="mono" style="color:var(--brand)">${h(ref)}</span> — ${h(reason)}</div>
      </div>
      <button class="btn sm" onclick="navigate('${target}')">Take action ›</button>
    </div>`;
}
function reminderRow(icon, title, sub, due, urgent, onclickJs) {
  return `
    <div class="reminder ${urgent ? "due-today" : ""}">
      <div class="r-icon">${icon}</div>
      <div>
        <div class="r-title">${h(title)}</div>
        <div class="r-sub">${h(sub)}</div>
      </div>
      <div class="r-due ${urgent ? "urgent" : ""}">${h(due)}</div>
      <button class="btn sm" onclick="${onclickJs}">Open</button>
    </div>`;
}

// ============================================================
// LOAD VISIBILITY  (route id: "loads")
// ============================================================
// Status set per spec (v5: includes COMPLETED)
const ALL_STATUSES = [
  "Awaiting Discharge", "In Customs", "Awaiting Release", "Ready to Outgate",
  "Sent to Carrier", "In Transit", "Delivered", "Invoice Pending",
  "Audit Exception", "Approved", "COMPLETED",
];

let LV_FILTERS = {
  statuses: new Set(),  // empty = all
  carrier: "all",
  origin: "all",
  search: "",
};
let LV_STATE = {
  selected: new Set(),
  sentTimestamps: new Map(),  // load id -> ISO timestamp
  showStatusPop: false,
};
let LV_SORT = { key: "load", dir: "asc" };

// Synthetic rows that fill out the spec's demo distribution
// (the seeded Excel only contains 2 Out-Gate Ready + 4 pre-arrival containers;
// spec wants ~6 of each so the batch-dispatch demo has selectable loads)
const SYNTHETIC_LOADS = [
  // 4 more Out-Gate Ready containers
  { container: "HMMU8541209", ssl: "HMM",     vessel: "HMM ALGECIRAS",       port: "Long Beach, CA",  lfd: "2026-05-21", risk: "MEDIUM", carrier: "CDS", carrierFull: "Continental Drayage Solutions", origin: "Long Beach — Pier T",   equip: "40HC", po: "NA-PO-68241" },
  { container: "MAEU7821044", ssl: "Maersk",  vessel: "MAERSK LIRQUEN",      port: "Long Beach, CA",  lfd: "2026-05-22", risk: "MEDIUM", carrier: "PCD", carrierFull: "Pacific Coastline Drayage",     origin: "Long Beach — Pier T",   equip: "40HC", po: "NA-PO-68242" },
  { container: "YMMU6604130", ssl: "Yang Ming", vessel: "YM WONDROUS",       port: "Los Angeles, CA", lfd: "2026-05-23", risk: "LOW",    carrier: "CDS", carrierFull: "Continental Drayage Solutions", origin: "Los Angeles — Pier 400", equip: "40HC", po: "NA-PO-68243" },
  { container: "COSU4419875", ssl: "COSCO",   vessel: "COSCO SHIPPING ARIES", port: "Long Beach, CA", lfd: "2026-05-24", risk: "LOW",    carrier: "PCD", carrierFull: "Pacific Coastline Drayage",     origin: "Long Beach — ETS",      equip: "40HC", po: "NA-PO-68244" },
  // 2 more pre-arrival pipeline rows (the spec names these explicitly in the acceptance criteria)
  { container: "MEDU4421907", ssl: "MSC",     vessel: "MSC INGRID",          port: "Long Beach, CA",  lfd: "2026-05-29", risk: "—",      carrier: "—", carrierFull: "— (dispatch not yet assigned)",        origin: "Long Beach — Pier T",   equip: "40HC", po: "NA-PO-68245", stage: "Awaiting Discharge" },
  { container: "TCLU3308820", ssl: "OOCL",    vessel: "OOCL POLAND",         port: "Long Beach, CA",  lfd: "2026-05-27", risk: "—",      carrier: "—", carrierFull: "— (dispatch not yet assigned)",        origin: "Long Beach — Pier T",   equip: "40HC", po: "NA-PO-68246", stage: "Awaiting Release" },
];

// Build the unified row set: 50 invoiced + ~6 pre-arrival pipeline
// v5: the 10 oldest clean invoiced loads are flipped to COMPLETED to demo the new status
const COMPLETED_INV_IDS = new Set([
  "PCD-INV-50001","PCD-INV-50002","PCD-INV-50003","PCD-INV-50004","PCD-INV-50005",
  "PCD-INV-50007","PCD-INV-50008","PCD-INV-50009","PCD-INV-50010","PCD-INV-50011",
]);
function buildLoadRows() {
  const rows = [];

  // 50 invoiced loads → derive status
  for (const inv of D.invoices) {
    const cont = D.containers.find(c => c["Container #"] === inv["Container #"]);
    const finding = auditByInv[inv["Invoice #"]];
    let status;
    if (LV_STATE.sentTimestamps.has(inv["FB# / Load ID"])) status = "Sent to Carrier";
    else if (COMPLETED_INV_IDS.has(inv["Invoice #"]) && !finding) status = "COMPLETED";
    else if (finding) status = "Audit Exception";
    else if (inv.Status === "APPROVED" || inv.Status === "PAID") status = "Approved";
    else if (cont && cont.Stage === "Out-Gate Ready") status = "Ready to Outgate";
    else if (cont && cont.Stage === "In Customs") status = "In Customs";
    else if (cont && cont.Stage === "Awaiting Release") status = "Awaiting Release";
    else if (cont && cont["Pickup Date"] && cont.Stage !== "Delivered") status = "In Transit";
    else if (cont && cont.Stage === "Delivered" && inv.Status === "PENDING REVIEW") status = "Invoice Pending";
    else if (cont && cont.Stage === "Delivered") status = "Delivered";
    else status = "Invoice Pending";

    rows.push({
      kind: "invoiced",
      loadId: inv["FB# / Load ID"],
      invoiceId: inv["Invoice #"],
      container: inv["Container #"],
      carrier: CARRIER_SHORT[inv.Carrier] || inv.Carrier,
      carrierFull: inv.Carrier,
      origin: inv.Origin,
      destination: inv.Destination,
      eta: cont?.["Discharge Date"] || "—",
      lfd: cont?.LFD || "—",
      status,
      cont,
      inv,
      finding,
    });
  }

  // Real Out-Gate Ready containers in the sheet (will surface as Ready to Outgate loads)
  const realOGR = D.containers.filter(c => c.Stage === "Out-Gate Ready");
  for (const c of realOGR) {
    rows.push({
      kind: "prearrival",
      loadId: `FB${(c.Vessel || "OGR").split(" ")[0].slice(0,4).toUpperCase()}-${c["Container #"].slice(-4)}`,
      invoiceId: null,
      container: c["Container #"],
      carrier: "PCD",
      carrierFull: "Pacific Coastline Drayage",
      origin: c["US Port"] === "Long Beach, CA" ? "Long Beach — Pier T" : (c["US Port"] || "—"),
      destination: "NewAge Perris CA",
      eta: c["Discharge Date"] || "docked",
      lfd: c.LFD || "—",
      status: "Ready to Outgate",
      cont: c,
      inv: null,
      finding: null,
    });
  }

  // Real pre-arrival containers from the sheet (Awaiting Discharge / Customs / Release)
  const realPipeline = D.containers.filter(c => ["Awaiting Discharge", "In Customs", "Awaiting Release"].includes(c.Stage));
  for (const c of realPipeline) {
    rows.push({
      kind: "prearrival",
      loadId: `FB${(c.Vessel || "PRE").split(" ")[0].slice(0,4).toUpperCase()}-${c["Container #"].slice(-4)}`,
      invoiceId: null,
      container: c["Container #"],
      carrier: "—",
      carrierFull: "— (dispatch not yet assigned)",
      origin: c["US Port"] || "—",
      destination: "NewAge Perris CA",
      eta: c["Discharge Date"] || "ETA 2026-05-22",
      lfd: c.LFD || "—",
      status: c.Stage,
      cont: c,
      inv: null,
      finding: null,
    });
  }

  // Synthetic rows fill the demo distribution (spec wants ~6 OGR + ~6 pipeline)
  for (const s of SYNTHETIC_LOADS) {
    const isOGR = !s.stage || s.stage === "Out-Gate Ready";
    rows.push({
      kind: "prearrival",
      loadId: `FB${(s.vessel || "FB").split(" ")[0].slice(0,4).toUpperCase()}-${s.container.slice(-4)}`,
      invoiceId: null,
      container: s.container,
      carrier: s.carrier,
      carrierFull: s.carrierFull,
      origin: s.origin,
      destination: "NewAge Perris CA",
      eta: "2026-05-" + (15 + (s.container.charCodeAt(0) % 4)).toString().padStart(2, "0"),
      lfd: s.lfd,
      status: isOGR ? "Ready to Outgate" : s.stage,
      cont: {
        "Container #": s.container, "Steamship Line": s.ssl, Vessel: s.vessel,
        Equipment: s.equip, "US Port": s.port, LFD: s.lfd,
        Stage: isOGR ? "Out-Gate Ready" : s.stage,
        "Demurrage Risk": s.risk, "Free Time (days)": 7,
        "Customs Status": isOGR ? "Cleared" : (s.stage === "In Customs" ? "Pending" : "Cleared"),
        "SSL Released": isOGR ? "Yes" : "No",
        Status: isOGR ? "Ready for pickup" : s.stage,
        "Linked PO": s.po,
        Notes: "",
      },
      inv: null,
      finding: null,
    });
  }

  return rows;
}

// Action recommendation per row (one-line, color-coded)
function rowAction(r) {
  if (r.status === "Audit Exception") return { txt: "Review audit exception", cls: "red" };
  if (r.status === "Ready to Outgate" && r.cont && r.lfd && r.lfd < today) return { txt: "Pickup ASAP — LFD passed", cls: "red" };
  if (r.status === "Ready to Outgate" && r.cont && r.lfd === today) return { txt: "Dispatch by EOD — LFD today", cls: "orange" };
  if (r.status === "Ready to Outgate" && r.cont && r.lfd === tomorrow) return { txt: "Dispatch by EOD — LFD tomorrow", cls: "orange" };
  if (r.status === "Ready to Outgate") return { txt: "Send dispatch instruction — Out-Gate Ready", cls: "orange" };
  if (r.status === "Sent to Carrier") {
    const ts = LV_STATE.sentTimestamps.get(r.loadId);
    return { txt: `Sent to carrier · ${ts ? new Date(ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : "now"}`, cls: "blue" };
  }
  if (r.status === "In Customs") return { txt: "Customs in progress — monitor", cls: "gray" };
  if (r.status === "Awaiting Release") return { txt: "SSL hold — monitor", cls: "gray" };
  if (r.status === "Awaiting Discharge") return { txt: "Schedule appointment for arrival", cls: "blue" };
  if (r.status === "In Transit") return { txt: "In transit — POD pending", cls: "gray" };
  if (r.status === "Invoice Pending") return { txt: "Awaiting carrier invoice", cls: "gray" };
  if (r.status === "Approved" || r.status === "Delivered" || r.status === "COMPLETED") return { txt: "—", cls: "dash" };
  return { txt: "—", cls: "dash" };
}

ROUTES.loads = function (root, sub) {
  if (sub) return renderLoadDetail(root, sub);

  const all = buildLoadRows();
  // Carriers and origins for the filter
  const carriers = [...new Set(all.map(r => r.carrier).filter(c => c !== "—"))].sort();
  const origins = [...new Set(all.map(r => r.origin))].sort();

  // Apply filters
  let rows = all.slice();
  if (LV_FILTERS.statuses.size > 0) rows = rows.filter(r => LV_FILTERS.statuses.has(r.status));
  if (LV_FILTERS.carrier !== "all") rows = rows.filter(r => r.carrier === LV_FILTERS.carrier);
  if (LV_FILTERS.origin !== "all") rows = rows.filter(r => r.origin === LV_FILTERS.origin);
  if (LV_FILTERS.search) {
    const q = LV_FILTERS.search.toLowerCase();
    rows = rows.filter(r =>
      (r.loadId || "").toLowerCase().includes(q) ||
      (r.container || "").toLowerCase().includes(q) ||
      (r.inv?.["BOL/MBL #"] || "").toLowerCase().includes(q));
  }
  // Sort
  const sortKey = LV_SORT.key;
  rows.sort((a, b) => {
    const va = String(a[sortKey] ?? ""); const vb = String(b[sortKey] ?? "");
    return LV_SORT.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  // Selected (only Ready to Outgate are selectable for batch dispatch)
  const selectableLoadIds = rows.filter(r => r.status === "Ready to Outgate").map(r => r.loadId);
  const selectedCount = [...LV_STATE.selected].filter(id => selectableLoadIds.includes(id)).length;
  const batchEnabled = selectedCount > 0;

  root.innerHTML = `
    <div class="page-title-row">
      <div>
        <h1 class="page-title">Load Visibility</h1>
        <div class="page-subtitle">One row per FB# / Load ID · <span class="mono">${all.length}</span> loads (${all.filter(r => r.kind==='prearrival').length} pre-arrival) · ${ALL_STATUSES.length} statuses</div>
      </div>
    </div>

    <div class="action-bar">
      <button class="btn secondary" onclick="openPreArrivalForecast()">📧 Send Pre-Arrival Forecast</button>
      <button class="btn" ${batchEnabled ? "" : "disabled"} onclick="${batchEnabled ? "openBatchDispatch()" : ""}">
        📧 Send Batch Dispatch Instruction
      </button>
      <span class="sel-count ${batchEnabled ? "has" : ""}">${selectedCount} selected · ${selectableLoadIds.length} eligible (Ready to Outgate)</span>
      <span class="spacer"></span>
      <button class="btn secondary">Export CSV</button>
    </div>

    <div class="toolbar">
      <div class="filter-host">
        <button class="chip ${LV_FILTERS.statuses.size > 0 ? "active" : ""}" onclick="LV_STATE.showStatusPop=!LV_STATE.showStatusPop;render()">
          Status${LV_FILTERS.statuses.size > 0 ? ` · ${LV_FILTERS.statuses.size}` : ""} ▾
        </button>
        ${LV_STATE.showStatusPop ? `
          <div class="filter-pop" id="statusPop">
            ${ALL_STATUSES.map(s => `
              <label>
                <input type="checkbox" data-status="${h(s)}" ${LV_FILTERS.statuses.has(s) ? "checked" : ""}>
                ${stagePill(s)}
              </label>`).join("")}
            <div style="display:flex;justify-content:space-between;padding:4px 8px;margin-top:4px;border-top:1px solid var(--border);">
              <button class="btn-link" onclick="LV_FILTERS.statuses=new Set();render()">Clear</button>
              <button class="btn-link" onclick="LV_STATE.showStatusPop=false;render()">Close</button>
            </div>
          </div>` : ""}
      </div>
      <select class="txt" id="lvCarrier" style="font-size:12px;">
        <option value="all">All carriers (${carriers.length})</option>
        ${carriers.map(c => `<option value="${h(c)}" ${LV_FILTERS.carrier===c?"selected":""}>${h(c)}</option>`).join("")}
      </select>
      <select class="txt" id="lvOrigin" style="font-size:12px; max-width: 220px;">
        <option value="all">All origin ports</option>
        ${origins.map(o => `<option value="${h(o)}" ${LV_FILTERS.origin===o?"selected":""}>${h(o)}</option>`).join("")}
      </select>
      <span class="spacer"></span>
      <input class="txt" id="lvSearch" placeholder="Search Load ID, Container, BOL…" value="${h(LV_FILTERS.search)}" style="width: 280px;">
    </div>

    <div class="card">
      <div class="card-body tight">
        <table class="tbl">
          <thead>
            <tr>
              <th class="col-sel"><input type="checkbox" id="lvSelAll"></th>
              ${sortableTh("Load ID (FB#)", "loadId")}
              ${sortableTh("Container", "container")}
              ${sortableTh("Carrier", "carrier")}
              ${sortableTh("Origin / Terminal", "origin")}
              ${sortableTh("Destination", "destination")}
              ${sortableTh("ETA", "eta")}
              ${sortableTh("LFD", "lfd")}
              ${sortableTh("Status", "status")}
              <th>Action Recommendation</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(r => lvRow(r, selectableLoadIds)).join("") :
              `<tr><td colspan="10" class="empty">No loads match the current filters.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Wire interactions
  $("#lvCarrier").addEventListener("change", e => { LV_FILTERS.carrier = e.target.value; render(); });
  $("#lvOrigin").addEventListener("change", e => { LV_FILTERS.origin = e.target.value; render(); });
  $("#lvSearch").addEventListener("input", e => {
    LV_FILTERS.search = e.target.value;
    // mirror into global search input so the topbar stays in sync
    const gs = document.getElementById("globalSearch");
    if (gs && gs.value !== e.target.value) gs.value = e.target.value;
    clearTimeout(window.__lvSearchTimer);
    window.__lvSearchTimer = setTimeout(() => {
      render();
      const ne = $("#lvSearch");
      if (ne) { ne.focus(); ne.setSelectionRange(ne.value.length, ne.value.length); }
    }, 180);
  });
  // Status checkboxes
  if (LV_STATE.showStatusPop) {
    root.querySelectorAll('#statusPop input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", () => {
        const s = cb.dataset.status;
        if (cb.checked) LV_FILTERS.statuses.add(s); else LV_FILTERS.statuses.delete(s);
        render();
      });
    });
  }
  // Per-row checkboxes
  root.querySelectorAll('.lv-cb').forEach(cb => {
    cb.addEventListener("change", (e) => {
      e.stopPropagation();
      const id = cb.dataset.loadId;
      if (cb.checked) LV_STATE.selected.add(id); else LV_STATE.selected.delete(id);
      render();
    });
    cb.addEventListener("click", (e) => e.stopPropagation());
  });
  // Select-all
  $("#lvSelAll").addEventListener("change", (e) => {
    const checked = e.target.checked;
    selectableLoadIds.forEach(id => checked ? LV_STATE.selected.add(id) : LV_STATE.selected.delete(id));
    render();
  });
  // Sort header click
  root.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (LV_SORT.key === key) LV_SORT.dir = LV_SORT.dir === "asc" ? "desc" : "asc";
      else { LV_SORT.key = key; LV_SORT.dir = "asc"; }
      render();
    });
  });
};

function sortableTh(label, key) {
  const arrow = LV_SORT.key === key ? (LV_SORT.dir === "asc" ? " ↑" : " ↓") : "";
  return `<th data-sort="${key}" style="cursor:pointer;user-select:none;">${h(label)}${arrow}</th>`;
}

function lvRow(r, selectableLoadIds) {
  const action = rowAction(r);
  const checkable = selectableLoadIds.includes(r.loadId);
  const selected = LV_STATE.selected.has(r.loadId);
  return `
    <tr class="clickable" onclick="navigate('${r.invoiceId ? "loads/" + r.invoiceId : "containers/" + r.container}')">
      <td class="col-sel" onclick="event.stopPropagation()">
        ${checkable ? `<input type="checkbox" class="lv-cb" data-load-id="${h(r.loadId)}" ${selected ? "checked" : ""}>` : `<span class="muted-2" title="Only Ready to Outgate loads are selectable for batch dispatch">·</span>`}
      </td>
      <td class="mono"><b>${h(r.loadId)}</b></td>
      <td class="mono">${h(r.container)}</td>
      <td>${h(r.carrier)}</td>
      <td>${h(r.origin)}</td>
      <td>${h(r.destination)}</td>
      <td class="mono">${h(r.eta)}</td>
      <td class="mono">${h(r.lfd)}</td>
      <td>${stagePill(r.status)}</td>
      <td class="act-${action.cls}">${h(action.txt)}</td>
    </tr>`;
}

// ============================================================
// LOAD DETAIL
// ============================================================
function renderLoadDetail(root, invoiceId) {
  // BUG-19: look up by Invoice # first, then by FB# / Load ID, so deep links
  // from upload-created loads (which often use the FB# in the URL) resolve.
  const inv = D.invoices.find(i => i["Invoice #"] === invoiceId)
    || D.invoices.find(i => i["FB# / Load ID"] === invoiceId);
  if (!inv) {
    root.innerHTML = `<div class="empty"><strong>Load not found</strong>${h(invoiceId)}</div>`;
    return;
  }
  const cont = D.containers.find(c => c["Container #"] === inv["Container #"]);
  const po = D.pos.find(p => p["Container #"] === inv["Container #"]);
  const finding = auditByInv[inv["Invoice #"]];
  // Customs entry matched by container # (D.customs.entries is the master workbook)
  const customsEntry = (D.customs && D.customs.entries) ? D.customs.entries.find(e => e.container === inv["Container #"]) : null;
  const customsInvNo = D.customs ? D.customs.invoice : null;
  const drayStatus = (window.DRAY_DISPUTED && window.DRAY_DISPUTED.has(inv["Invoice #"]))
    ? '<span class="pill warn">In Dispute</span>'
    : (finding ? '<span class="pill draft">Pending Review</span>' : '<span class="pill ok">Complete</span>');
  const customsStatus = customsEntry
    ? ((window.CUSTOMS_DISPUTED && window.CUSTOMS_DISPUTED.has(customsEntry.entry))
        ? '<span class="pill warn">In Dispute</span>'
        : ((window.CUSTOMS_PENDING_ENTRIES && window.CUSTOMS_PENDING_ENTRIES.has(customsEntry.entry))
            ? '<span class="pill draft">Pending Review</span>'
            : '<span class="pill ok">Complete</span>'))
    : null;

  root.innerHTML = `
    <div class="row" style="margin-bottom:14px;">
      <button class="btn secondary sm" onclick="navigate('loads')">← All loads</button>
    </div>

    <div class="detail-header">
      <div>
        <h1>Load <span class="mono">${h(inv["FB# / Load ID"])}</span></h1>
        <div class="muted" style="font-size: 12.5px;">Container <span class="mono">${h(inv["Container #"])}</span> · BOL <span class="mono">${h(inv["BOL/MBL #"])}</span> · ${h(inv.Equipment)} · ${h(inv.Carrier)}</div>
      </div>
      <div class="row">
        ${stagePill(cont ? cont.Stage : "Invoice Pending")}
        <button class="btn secondary" onclick="openCarrierSelect('${h(inv["Container #"])}','${h(inv.Origin)}','${h(inv.Destination)}','${h(inv.Equipment)}')">Select dray carrier</button>
        <button class="btn" onclick="openDispatchEmail('${h(inv["FB# / Load ID"])}', '${h(inv["Container #"])}', '${h(inv.Carrier)}')">Send dispatch instruction</button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="card">
        <div class="card-head"><div class="card-title">Milestone timeline</div></div>
        <div class="card-body">${milestones(cont, inv)}</div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="card-title">References</div></div>
          <div class="card-body">
            <dl class="kv-grid">
              <dt>Lane</dt><dd>${h(inv.Origin)} → ${h(inv.Destination)}</dd>
              <dt>Lane criticality</dt><dd>${pill(laneCriticality(inv.Origin, inv.Destination))}</dd>
              <dt>Carrier</dt><dd>${h(inv.Carrier)}</dd>
              <dt>Equipment</dt><dd>${h(inv.Equipment)}</dd>
              <dt>Linked PO</dt><dd>${po ? `<span class="mono">${h(po["PO #"])}</span> · ${h(po["SKU Family"])}` : `<span class="muted">— no PO linked —</span>`}</dd>
              <dt>Steamship line</dt><dd>${cont ? h(cont["Steamship Line"]) : "—"}</dd>
              <dt>Vessel</dt><dd>${cont ? h(cont.Vessel) : "—"}</dd>
            </dl>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div class="card-title">Invoices summary</div>
            <div class="card-sub">Drayage + customs for this load</div>
          </div>
          <div class="card-body tight">
            <table class="tbl">
              <thead>
                <tr><th>Type</th><th>Reference</th><th>Carrier / Broker</th><th class="num">Amount</th><th>Status</th><th>Audit</th></tr>
              </thead>
              <tbody>
                <tr class="clickable" onclick="navigate('invoices/drayage/${h(inv["Invoice #"])}')">
                  <td><span class="pill blue">Drayage</span></td>
                  <td class="mono"><b>${h(inv["Invoice #"])}</b></td>
                  <td>${h(inv.Carrier)}</td>
                  <td class="num mono"><b>${fmt$(inv["Grand Total (USD)"])}</b></td>
                  <td>${drayStatus}</td>
                  <td>${finding ? pill(finding.Severity) : '<span class="pill ok">OK</span>'}</td>
                </tr>
                ${customsEntry ? `
                <tr class="clickable" onclick="navigate('invoices/customs/${h(customsInvNo)}')">
                  <td><span class="pill blue">Customs</span></td>
                  <td class="mono"><b>${h(customsEntry.entry)}</b></td>
                  <td>Livingston (broker)</td>
                  <td class="num mono"><b>${fmt$(customsEntry.subtotal)}</b></td>
                  <td>${customsStatus}</td>
                  <td><span class="muted" style="font-size:11px;">duty ${fmt$(customsEntry.duty)}</span></td>
                </tr>` : `
                <tr>
                  <td><span class="pill blue">Customs</span></td>
                  <td colspan="5" class="muted">— no customs entry linked to this container —</td>
                </tr>`}
              </tbody>
            </table>
            <div class="muted" style="font-size:11.5px;margin-top:8px;">
              Combined landed cost: <b class="num">${fmt$((inv["Grand Total (USD)"] || 0) + (customsEntry ? (customsEntry.subtotal || 0) : 0))}</b>
              ${finding ? ` · <span class="text-red">Audit flagged ${fmt$(finding["$ Impact (USD)"])} at risk</span>` : ""}
            </div>
          </div>
        </div>

        <div class="ai-card">
          <span class="ai-badge">AI</span>
          <div class="ai-title">Suggested action</div>
          <div class="ai-body" style="font-size: 12.5px;">
            ${suggestedAction(cont, inv, finding)}
          </div>
        </div>

        ${finding ? `
        <div class="exc-card ${finding.Severity.toLowerCase()}">
          <div class="exc-head"><div class="exc-title">Audit finding · ${h(finding["Rule Family"])}</div>${pill(finding.Severity)}</div>
          <div class="exc-body">${h(finding["What's Wrong"])}</div>
          <div class="exc-amount">${fmt$(finding["$ Impact (USD)"])}</div>
        </div>` : ""}
      </div>
    </div>
  `;
}

function suggestedAction(cont, inv, finding) {
  if (!cont) return "No container milestones available.";
  if (cont.Stage === "Out-Gate Ready" && /HIGH|CRITICAL/.test(cont["Demurrage Risk"] || "")) {
    return `Container <span class="mono">${h(cont["Container #"])}</span> is Out-Gate Ready with <b>LFD ${h(cont.LFD)}</b>. Dispatch today at <b>ITS Pier T</b> (7 open slots, 08:00–10:00). Projected savings: <b>${fmt$(250)}</b> day-one demurrage at OOCL ladder.`;
  }
  if (finding && finding["Rule Family"] === "demurrage_risk") {
    return `Container picked up <b>2 days after LFD</b>. Demurrage of <b>${fmt$(375)}</b> already incurred. Add to lessons-learned; reorder dispatch sequence next time.`;
  }
  if (cont.Stage === "In Customs") return `Container is on CBP hold (${h(cont["Customs Status"])}). Typical release in 3–5 days; no dispatch recommendation yet.`;
  if (cont.Stage === "Delivered") return `Load delivered. No further action.`;
  return `Monitor — ${h(cont.Status)}.`;
}

// Maps a live carrier event (T49 / mock / ShipsGo) to one of our canonical
// timeline stages. Order matters for the "In Transit" disambiguation.
const LIVE_EVENT_STAGE_MAP = [
  // Order matters — first match wins. Mid-voyage / inland-leg patterns first
  // so they win over generic "loaded" / "gate out" matches.
  [/empty return|empty drop/i,                           "Empty Returned"],
  [/transshipment|sailing|at sea|underway|in transit \(ocean\)|^in transit$/i, "In Transit (Ocean)"],
  [/inland|rail|on truck|in transit \(inland\)/i,        "In Transit (Inland)"],
  [/deliver(ed)?|consignee/i,                            "Delivered"],
  [/gate ?out|picked up|departure from (pod|terminal)/i, "Pickup"],
  [/available for pickup|out.?gate.?ready|ready for pickup|lfd/i, "Out-Gate Ready"],
  [/ssl release|carrier release|line release|^released/i, "SSL Released"],
  [/customs (cleared|release|hold lifted)/i,             "Customs Cleared"],
  [/discharg/i,                                          "Discharge"],
  [/vessel arriv|arrived (at )?(pod|destination)|berth/i,"Vessel Arrival"],
  [/vessel departed|departed (pol|origin)|departure/i,   "Vessel ETD"],
  [/load(ed)? (on|onto) vessel|on board|loaded onto/i,   "Vessel ETD"],
  [/gate ?in|received at (pol|origin)|stuffed/i,         "Vessel ETD"],
  [/empty.*released|empty.*pickup|empty.*depot/i,        "Vessel ETD"],
];

function _liveEventToStage(eventName) {
  if (!eventName) return null;
  for (const [re, st] of LIVE_EVENT_STAGE_MAP) {
    if (re.test(eventName)) return st;
  }
  return null;
}

function milestones(cont, inv, live) {
  if (!cont) return `<div class="empty">No container milestones available.</div>`;
  const stages = [
    "Vessel ETD", "In Transit (Ocean)", "Vessel Arrival", "Discharge",
    "Customs Cleared", "SSL Released", "Out-Gate Ready", "Pickup",
    "In Transit (Inland)", "Delivered", "Empty Returned",
  ];

  const done = new Set();
  const meta = {};

  if (Array.isArray(live) && live.length) {
    // Drive entirely from live carrier data. Each ACTUAL event marks its mapped
    // stage (and all earlier stages) done; ESTIMATED events fill the meta line
    // for upcoming stages but do not mark them done.
    const actuals = live.filter(m => m.actual !== false);
    const estimates = live.filter(m => m.actual === false);

    let furthest = -1;
    actuals.forEach(m => {
      const st = _liveEventToStage(m.event);
      if (!st) return;
      const idx = stages.indexOf(st);
      if (idx > furthest) furthest = idx;
      meta[st] = `${(m.location || "").trim()}${m.timestamp ? " · " + _shortTs(m.timestamp) : ""}`;
    });
    for (let i = 0; i <= furthest; i++) done.add(stages[i]);

    estimates.forEach(m => {
      const st = _liveEventToStage(m.event);
      if (!st || done.has(st)) return;
      meta[st] = `ETA ${_shortTs(m.timestamp)}${m.location ? " · " + m.location : ""}`;
    });
  } else {
    // Fallback: derive from the static container record (legacy behavior).
    const stage = cont.Stage;
    const customsCleared = cont["Customs Status"] === "Cleared";
    const sslReleased = cont["SSL Released"] === "Yes";
    if (cont["Discharge Date"]) { done.add("Vessel ETD"); done.add("In Transit (Ocean)"); done.add("Vessel Arrival"); done.add("Discharge"); }
    if (customsCleared) done.add("Customs Cleared");
    if (sslReleased) done.add("SSL Released");
    if (["Out-Gate Ready", "Delivered"].includes(stage)) done.add("Out-Gate Ready");
    if (cont["Pickup Date"]) { done.add("Pickup"); done.add("In Transit (Inland)"); }
    if (stage === "Delivered") done.add("Delivered");
    if ((cont.Status || "").includes("Returned")) done.add("Empty Returned");

    Object.assign(meta, {
      "Vessel ETD": cont["Discharge Date"] ? "−14d" : "",
      "In Transit (Ocean)": cont["Discharge Date"] ? "voyage complete" : (stage === "Awaiting Discharge" ? "on the water" : ""),
      "Vessel Arrival": cont["Discharge Date"] ? "vessel docked" : (stage === "Awaiting Discharge" ? "ETA 2026-05-22" : ""),
      "Discharge": cont["Discharge Date"] || "",
      "Customs Cleared": customsCleared ? "cleared" : (cont["Customs Status"] || "pending"),
      "SSL Released": sslReleased ? "released" : (stage === "Awaiting Release" ? "expected <24h" : "—"),
      "Out-Gate Ready": done.has("Out-Gate Ready") ? `LFD ${cont.LFD || "—"}` : "—",
      "Pickup": cont["Pickup Date"] || "—",
      "In Transit (Inland)": cont["Pickup Date"] && stage !== "Out-Gate Ready" ? "in transit" : "—",
      "Delivered": stage === "Delivered" ? "delivered" : "—",
      "Empty Returned": (cont.Status || "").includes("Returned") ? "returned" : "—",
    });
  }

  let curr = null;
  for (const s of stages) { if (!done.has(s)) { curr = s; break; } }

  return `<div class="timeline">` + stages.map(s => {
    const cls = done.has(s) ? "done" : (s === curr ? "curr" : "pending");
    return `<div class="mile ${cls}">
      <div class="mile-label">${h(s)}</div>
      <div class="mile-meta">${h(meta[s] || "")}</div>
    </div>`;
  }).join("") + `</div>`;
}

// "2026-05-26T18:00:00Z" → "May 26 18:00"
function _shortTs(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch (_) { return ts; }
}

// ============================================================
// EMAIL HELPERS — Gmail / Outlook protocol
// ============================================================
function gmailComposeUrl({ to = "", cc = "", subject = "", body = "" }) {
  const params = new URLSearchParams();
  params.set("view", "cm");
  params.set("fs", "1");
  if (to) params.set("to", to);
  if (cc) params.set("cc", cc);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return "https://mail.google.com/mail/?" + params.toString();
}
function mailtoUrl({ to = "", cc = "", subject = "", body = "" }) {
  const params = [];
  if (cc) params.push("cc=" + encodeURIComponent(cc));
  if (subject) params.push("subject=" + encodeURIComponent(subject));
  if (body) params.push("body=" + encodeURIComponent(body));
  return "mailto:" + encodeURIComponent(to) + (params.length ? "?" + params.join("&") : "");
}
function emailActionsHtml({ to, cc, subject, body, onSent }) {
  const gmail = gmailComposeUrl({ to, cc, subject, body });
  const outlook = mailtoUrl({ to, cc, subject, body });
  // Encode onSent as a global registered handler
  const id = "ea_" + Math.random().toString(36).slice(2, 9);
  window.__sentHandlers = window.__sentHandlers || {};
  if (onSent) window.__sentHandlers[id] = onSent;
  return `
    <div class="email-actions">
      <a href="${gmail}" target="_blank" rel="noopener" class="email-btn gmail" onclick="window.__sentHandlers['${id}'] && window.__sentHandlers['${id}']()">
        <svg viewBox="0 0 24 24" fill="white"><path d="M22 6.5v11A2.5 2.5 0 0 1 19.5 20h-15A2.5 2.5 0 0 1 2 17.5v-11A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5zm-2 0L12 12 4 6.5V7l8 5.5L20 7v-.5z"/></svg>
        Open in Gmail
      </a>
      <a href="${outlook}" class="email-btn outlook">
        <svg viewBox="0 0 24 24" fill="#0078D4"><path d="M12 4l8 4v8l-8 4-8-4V8l8-4zm0 2.2L6 9.1v5.8l6 2.9 6-2.9V9.1L12 6.2zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>
        Open in Outlook
      </a>
      <span class="note">Demo: Gmail. Production: Outlook via SSO + Microsoft Graph API.</span>
    </div>`;
}

// ============================================================
// DISPATCH EMAIL MODAL
// ============================================================
window.openDispatchEmail = function (fb, container, carrier) {
  const carrierDom = (CARRIER_SHORT[carrier] || "carrier").toLowerCase();
  const cont = D.containers.find(c => c["Container #"] === container);
  const subject = `Dispatch instruction — Load ${fb} — Container ${container}`;
  const body = `Hi ${carrier} Dispatch,

Please dispatch container ${container} (FB# ${fb}) from ${cont?.["US Port"] || "the origin terminal"} for the following window:

  Preferred:  Tomorrow ${tomorrow} 08:00–10:00 at ITS Pier T (4 open slots).
  Alternate:  ${tomorrow} 10:00–12:00 at Pier J (TTI, 6 open slots).

Reason: Avoid Day-1 demurrage at the ${cont?.["Steamship Line"] || "ocean carrier"} per-diem ladder.
LFD on file: ${cont?.LFD || "—"}.

Please confirm dispatch within 2 business hours.

Thanks,
James Tran
Inbound Freight Manager, NewAge Products
james.tran@newageproducts.com  ·  (951) 555-0118`;

  const onSent = () => {
    LV_STATE.sentTimestamps.set(fb, new Date().toISOString());
    closeModal();
    setTimeout(() => toast(`Load ${fb} status → Sent to Carrier (${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})})`), 100);
  };

  openModal(el("div", { class: "modal" }, [
    el("div", { class: "modal-head" }, [
      el("h2", {}, [`Send dispatch instruction — ${fb}`]),
      el("button", { class: "x-btn", onclick: closeModal }, ["×"]),
    ]),
    el("div", { class: "modal-body", html: `
      <label class="field"><span class="lbl">To</span>
        <input class="txt" id="dispTo" value="dispatch@${carrierDom}.com">
      </label>
      <label class="field"><span class="lbl">Subject</span>
        <input class="txt" id="dispSubj" value="${h(subject)}">
      </label>
      <label class="field"><span class="lbl">Body</span>
        <textarea class="txt" id="dispBody" rows="11">${h(body)}</textarea>
      </label>
      ${emailActionsHtml({ to: `dispatch@${carrierDom}.com`, subject, body, onSent })}
    ` }),
    el("div", { class: "modal-foot" }, [
      el("button", { class: "btn secondary", onclick: closeModal }, ["Save draft"]),
    ]),
  ]));
};

// ============================================================
// CARRIER-SELECT MODAL with HIGH/MED/LOW hard floors
// ============================================================
window.openCarrierSelect = function (container, origin, destination, equipment) {
  const cont = D.containers.find(c => c["Container #"] === container);
  // For LB→Perris demo, force origin to "Long Beach — Pier T"
  if (!origin && cont && /Long Beach/i.test(cont["US Port"] || "")) origin = "Long Beach — Pier T";
  destination = destination || "NewAge Perris CA";
  equipment = equipment || cont?.Equipment || "40HC";

  const ranking = rankCarriersForLane(origin, destination, equipment);
  const { eligible, excluded, criticality, floor, weights } = ranking;

  const rowHtml = (r, isExcluded) => `
    <tr class="${r.recommended ? "recommended" : ""} ${isExcluded ? "excluded" : ""}">
      <td class="col-sel"><input type="radio" name="carsel" ${r.recommended ? "checked" : ""} ${isExcluded ? "disabled" : ""}></td>
      <td>
        <div style="font-weight:600;">${h(r.carrier)} ${r.recommended ? '<span class="rec-pill">Recommended</span>' : ''}</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:1px;">${h(r.laneId || "")} · ${h(r.tier || "Tier")}</div>
      </td>
      <td>${carrierTypeTag(r.type)}</td>
      <td class="num mono"><b>${fmt$0(r.rate)}</b></td>
      <td class="num"><b>${r.composite}</b></td>
      <td class="num">${r.capacity}/wk</td>
      <td style="color:${isExcluded ? '#791F1F' : 'var(--text-3)'}; font-size:11.5px;">
        ${isExcluded
          ? `Excluded — composite ${r.composite} &lt; ${criticality} threshold ${floor}`
          : (r.recommended ? "Cheapest eligible · best balance of cost &amp; reliability" : (r.notes || (r.composite >= 90 ? "Premium service · best scorecard" : "Eligible")))}
      </td>
    </tr>`;

  openModal(el("div", { class: "modal wide" }, [
    el("div", { class: "modal-head" }, [
      el("h2", { html: `Select drayage carrier — <span class="mono" style="font-size:13px;color:var(--text-3);">${h(container)}</span>` }),
      el("button", { class: "x-btn", onclick: closeModal }, ["×"]),
    ]),
    el("div", { class: "modal-body", html: `
      <div class="floor-note">
        <b>Lane:</b> ${h(origin || "—")} → ${h(destination)} · ${h(equipment)}
        &nbsp; · &nbsp; <b>Criticality:</b> ${pill(criticality)}
        &nbsp; · &nbsp; <b>Floor:</b> composite ≥ ${floor} required
        &nbsp; · &nbsp; <b>Weights:</b> ${(weights.c*100).toFixed(0)}% scorecard / ${(weights.$*100).toFixed(0)}% cost
      </div>

      <table class="rank-table">
        <thead>
          <tr>
            <th></th>
            <th>Carrier</th>
            <th>Type</th>
            <th class="num">Base $</th>
            <th class="num">Composite</th>
            <th class="num">Capacity</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          ${eligible.length ? eligible.map(r => rowHtml(r, false)).join("") : `<tr><td colspan="7" class="empty">No eligible carriers at this composite floor.</td></tr>`}
        </tbody>
      </table>

      ${excluded.length ? `
        <div class="rank-divider">Excluded · below ${criticality} composite floor</div>
        <table class="rank-table">
          <tbody>
            ${excluded.map(r => rowHtml(r, true)).join("")}
          </tbody>
        </table>` : ""}

      <div class="banner info" style="margin-top: 12px; margin-bottom: 0;">
        <span class="banner-icon">💡</span>
        <div><b>Why rate alone isn't enough.</b> Maersk Store Door is cheapest at $430, but its composite (60) is well below the HIGH-criticality floor of 85 — ocean-carrier dray is bundled with the ocean tender and shows up cheap on paper but underperforms on on-time pickup, invoice accuracy, and dispute resolution. PCD at $495 wins because it clears the floor and is cheapest among eligible.</div>
      </div>
    ` }),
    el("div", { class: "modal-foot" }, [
      el("button", { class: "btn secondary", onclick: closeModal }, ["Cancel"]),
      el("button", { class: "btn", onclick: () => { closeModal(); toast("Carrier confirmed."); } }, ["Confirm carrier"]),
    ]),
  ]));
};

// ============================================================
// PRE-ARRIVAL FORECAST MODAL
// ============================================================
window.openPreArrivalForecast = function (focusCarrier, focusVessel, vesselDate) {
  // Group upcoming containers by carrier (use containers in Awaiting Discharge / In Customs / Awaiting Release)
  const pipeline = D.containers.filter(c => ["Awaiting Discharge", "In Customs", "Awaiting Release"].includes(c.Stage));

  // Synthetic carrier assignment for pre-arrival manifests (in production: based on routing guide)
  // We'll route based on USPort: LB → PCD, LA → CDS, Oakland/Tacoma → PNT, Newark → ACS
  const assign = (c) => {
    if (focusCarrier === "PCD" && /Long Beach/i.test(c["US Port"] || "")) return "PCD";
    if (focusCarrier === "CDS" && /Los Angeles/i.test(c["US Port"] || "")) return "CDS";
    if (/Long Beach/i.test(c["US Port"] || "")) return "PCD";
    if (/Los Angeles/i.test(c["US Port"] || "")) return "CDS";
    if (/Newark|New York/i.test(c["US Port"] || "")) return "ACS";
    return "PNT";
  };
  const groups = {};
  for (const c of pipeline) {
    const code = assign(c);
    (groups[code] = groups[code] || []).push(c);
  }

  // Build email per group
  const groupHtml = Object.entries(groups).map(([code, conts]) => {
    const carrierName = SCORECARD_RAW[code]?.name || code;
    const carrierDom = code.toLowerCase();
    const subject = `Pre-Arrival Forecast — Week of 2026-05-19 — ${conts.length} containers`;
    const body = `Hi ${carrierName} Dispatch,

Please find below NewAge Products' pre-arrival forecast for the week of 2026-05-19. We are giving 7–14 days of advance notice to allow capacity reservation. Please confirm receipt and flag any capacity concerns.

${conts.map(c => `  · ${c.Vessel || "—"}  ·  ETA ${c["Discharge Date"] || "—"}  ·  ${c["US Port"] || "—"}  ·  ${c["Container #"]} (${c.Equipment})  →  NewAge Perris CA`).join("\n")}

We will follow up with a Refined Pre-Arrival list 2–4 days before each vessel docks, and a final Dispatch Instruction once the container is Out-Gate Ready.

Thanks,
James Tran
Inbound Freight Manager · NewAge Products`;

    return `
      <div class="email-group">
        <div class="email-group-head">
          <div class="who">${h(carrierName)} <span>· ${conts.length} containers</span></div>
          <div class="muted-2" style="font-size: 11px; font-family: var(--mono);">dispatch@${carrierDom}.com</div>
        </div>
        <div class="email-group-body">
          <table>
            <thead>
              <tr><th>Vessel</th><th>ETA</th><th>Terminal</th><th>Container</th><th>Equip</th><th>Destination</th></tr>
            </thead>
            <tbody>
              ${conts.map(c => `
                <tr>
                  <td>${h(c.Vessel || "—")}</td>
                  <td class="mono">${h(c["Discharge Date"] || "—")}</td>
                  <td>${h(c["US Port"] || "—")}</td>
                  <td class="mono">${h(c["Container #"])}</td>
                  <td>${h(c.Equipment)}</td>
                  <td>NewAge Perris CA</td>
                </tr>`).join("")}
            </tbody>
          </table>
          ${emailActionsHtml({ to: `dispatch@${carrierDom}.com`, subject, body, onSent: () => toast(`Pre-arrival sent to ${carrierName}`) })}
        </div>
      </div>`;
  }).join("");

  openModal(el("div", { class: "modal wide" }, [
    el("div", { class: "modal-head" }, [
      el("h2", {}, [focusVessel ? `Refined Pre-Arrival List — ${focusVessel} docks ${vesselDate}` : "Pre-Arrival Forecast — Week 21"]),
      el("button", { class: "x-btn", onclick: closeModal }, ["×"]),
    ]),
    el("div", { class: "modal-body", html: `
      <div class="floor-note">
        ${focusVessel
          ? `Refined manifest sent <b>2–4 days before docking</b>. One email per carrier; updates from the 7–14 day forecast are highlighted in their email.`
          : `Forecast sent <b>7–14 days in advance</b> so carriers can reserve capacity. One email per carrier, grouped by terminal. Filter by week if needed.`}
      </div>
      <div class="toolbar">
        <select class="txt"><option>Next 14 days (5 vessels)</option><option>Next 7 days (2 vessels)</option><option>Next 21 days (8 vessels)</option></select>
        <span class="spacer"></span>
        <span class="muted-2" style="font-size: 11.5px;">${pipeline.length} containers across ${Object.keys(groups).length} carriers</span>
      </div>
      ${groupHtml || `<div class="empty">No pre-arrival containers in pipeline.</div>`}
    ` }),
    el("div", { class: "modal-foot" }, [
      el("button", { class: "btn secondary", onclick: closeModal }, ["Close"]),
    ]),
  ]));
};

// ============================================================
// BATCH DISPATCH MODAL
// ============================================================
window.openBatchDispatch = function () {
  const all = buildLoadRows();
  const selected = all.filter(r => LV_STATE.selected.has(r.loadId) && r.status === "Ready to Outgate");
  if (selected.length === 0) return;

  // Group by carrier
  const groups = {};
  for (const r of selected) {
    (groups[r.carrier] = groups[r.carrier] || []).push(r);
  }

  const groupHtml = Object.entries(groups).map(([code, rows]) => {
    const carrierName = rows[0].carrierFull;
    const carrierDom = code.toLowerCase();
    const subject = `Batch Dispatch Instruction — ${rows.length} loads — week of ${today}`;
    const body = `Hi ${carrierName} Dispatch,

Please dispatch the following loads. All are currently Out-Gate Ready with active LFDs. Requested pickup window: tomorrow ${tomorrow} 08:00–14:00 from the respective terminals.

${rows.map(r => `  · FB# ${r.loadId}  ·  Container ${r.container}  ·  LFD ${r.lfd}  ·  Pickup # ${(r.inv?.["BOL/MBL #"] || "TBA").slice(-8)}  ·  ${r.origin} → ${r.destination}`).join("\n")}

Reason: Avoid Day-1 demurrage at the ocean-carrier per-diem ladders.

Please confirm dispatch within 2 business hours.

Thanks,
James Tran
Inbound Freight Manager · NewAge Products
james.tran@newageproducts.com  ·  (951) 555-0118`;

    return `
      <div class="email-group">
        <div class="email-group-head">
          <div class="who">${h(carrierName)} <span>· ${rows.length} loads</span></div>
          <div class="muted-2" style="font-size: 11px; font-family: var(--mono);">dispatch@${carrierDom}.com</div>
        </div>
        <div class="email-group-body">
          <table>
            <thead><tr><th>FB#</th><th>Container</th><th>Lane</th><th>LFD</th><th>Pickup #</th></tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td class="mono"><b>${h(r.loadId)}</b></td>
                  <td class="mono">${h(r.container)}</td>
                  <td>${h(r.origin)} → ${h(r.destination)}</td>
                  <td class="mono">${h(r.lfd)}</td>
                  <td class="mono">${h((r.inv?.["BOL/MBL #"] || "").slice(-8) || "TBA")}</td>
                </tr>`).join("")}
            </tbody>
          </table>
          ${emailActionsHtml({
            to: `dispatch@${carrierDom}.com`,
            subject, body,
            onSent: () => {
              const nowIso = new Date().toISOString();
              rows.forEach(r => LV_STATE.sentTimestamps.set(r.loadId, nowIso));
              LV_STATE.selected.clear();
              setTimeout(() => { closeModal(); toast(`${rows.length} loads → Sent to Carrier (${carrierName})`); }, 50);
            },
          })}
        </div>
      </div>`;
  }).join("");

  openModal(el("div", { class: "modal wide" }, [
    el("div", { class: "modal-head" }, [
      el("h2", {}, [`Batch Dispatch Instruction — ${selected.length} loads across ${Object.keys(groups).length} carriers`]),
      el("button", { class: "x-btn", onclick: closeModal }, ["×"]),
    ]),
    el("div", { class: "modal-body", html: `
      <div class="floor-note">
        On <b>Open in Gmail</b>, the selected loads move to <b>Sent to Carrier</b> with a timestamp recorded against your user.
      </div>
      ${groupHtml}
    ` }),
    el("div", { class: "modal-foot" }, [
      el("button", { class: "btn secondary", onclick: closeModal }, ["Cancel"]),
    ]),
  ]));
};

// ============================================================
// TOAST
// ============================================================
function toast(msg) {
  const t = el("div", { class: "banner info", style: "position:fixed;top:80px;right:32px;z-index:60;box-shadow:0 10px 30px rgba(15,23,42,0.15);min-width:280px;" }, [
    el("span", { class: "banner-icon", html: "✓" }),
    el("div", {}, [msg]),
  ]);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  const hash = window.location.hash.replace("#", "");
  if (hash) currentRoute = hash;
  render();
  wireGlobalSearch();
});

// ============================================================
// GLOBAL SEARCH — top-bar input, routes into page-level filter state
// ============================================================
const CONT_FILTERS = { search: "" };

let _gsDebounceTimer = null;

function wireGlobalSearch() {
  const inp = document.getElementById("globalSearch");
  if (!inp) return;
  inp.addEventListener("input", () => {
    const v = inp.value;
    // Push into whichever page-level filter applies
    if (currentRoute.startsWith("loads")) LV_FILTERS.search = v;
    else if (currentRoute.startsWith("containers")) CONT_FILTERS.search = v;
    // Both — keep them in sync so a search reads on both pages
    LV_FILTERS.search = v;
    CONT_FILTERS.search = v;
    clearTimeout(_gsDebounceTimer);
    _gsDebounceTimer = setTimeout(() => {
      render();
      const el2 = document.getElementById("globalSearch");
      if (el2) { el2.focus(); el2.setSelectionRange(el2.value.length, el2.value.length); }
    }, 180);
  });
  inp.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const v = inp.value.trim();
    if (!v) return;
    const hit = _gsResolveDirectHit(v);
    if (hit) navigate(hit);
  });
  // ⌘K / Ctrl-K focuses search
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const el2 = document.getElementById("globalSearch");
      if (el2) { el2.focus(); el2.select(); }
    }
  });
}

function _gsResolveDirectHit(q) {
  const v = q.toUpperCase();
  // 1) exact container # match
  if (D.containers && D.containers.some(c => (c["Container #"] || "").toUpperCase() === v)) return `containers/${q}`;
  // 2) exact invoice / load ID match
  const inv = (D.invoices || []).find(i =>
    (i["Invoice #"] || "").toUpperCase() === v || (i["FB# / Load ID"] || "").toUpperCase() === v);
  if (inv) return `loads/${inv["Invoice #"]}`;
  // 3) customs entry
  if (D.customs && D.customs.entries && D.customs.entries.some(e => (e.entry || "").toUpperCase() === v)) return "invoices/customs";
  return null;
}

// Expose globals (so other script files & inline handlers can use)
Object.assign(window, {
  D, navigate, closeModal, closeDrawer, openModal, openDrawer,
  pill, stagePill, fmt$, fmt$0, h, el, toast,
  auditByInv, CARRIER_SHORT, SCORECARD, SCORECARD_RAW,
  severityRank, containerLocation, milestones,
  rankCarriersForLane, carrierTypeTag, laneCriticality,
  emailActionsHtml, gmailComposeUrl, mailtoUrl,
  LV_STATE, LV_FILTERS,
  buildLoadRows, today, tomorrow,
});
