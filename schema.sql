-- Maverick SQLite schema. Idempotent; safe to run multiple times.

CREATE TABLE IF NOT EXISTS carriers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  carrier_type TEXT NOT NULL,
  msa_ref TEXT,
  contact_email TEXT
);

CREATE TABLE IF NOT EXISTS carrier_scorecard (
  carrier_name TEXT PRIMARY KEY,
  carrier_type TEXT,
  on_time_pickup REAL,
  on_time_delivery REAL,
  invoice_accuracy REAL,
  accessorial_pct REAL,
  dispute_win_rate REAL,
  composite_score REAL,
  trailing_90d_loads INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS rate_card (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lane_id TEXT UNIQUE NOT NULL,
  carrier_name TEXT NOT NULL,
  carrier_type TEXT,
  origin_terminal TEXT NOT NULL,
  destination_dc TEXT NOT NULL,
  lane_criticality TEXT NOT NULL DEFAULT 'MEDIUM',
  equipment TEXT NOT NULL,
  base_rate REAL NOT NULL,
  fsc_pct REAL NOT NULL,
  tier TEXT,
  effective_from DATE,
  effective_to DATE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS accessorial_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  description TEXT,
  unit TEXT,
  rate REAL,
  free_allowance TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS containers (
  number TEXT PRIMARY KEY,
  steamship_line TEXT,
  vessel TEXT,
  equipment TEXT,
  origin_port TEXT,
  us_port TEXT,
  discharge_date DATE,
  customs_status TEXT,
  ssl_released TEXT,
  lfd DATE,
  pickup_date DATE,
  free_time_days INTEGER,
  stage TEXT,
  container_status TEXT,
  days_at_location INTEGER,
  demurrage_risk TEXT,
  status TEXT,
  linked_po TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  po_no TEXT PRIMARY KEY,
  supplier TEXT,
  origin TEXT,
  sku_family TEXT,
  units INTEGER,
  unit_cost REAL,
  value REAL,
  hts_code TEXT,
  container_no TEXT,
  issue_date DATE,
  eta DATE
);

CREATE TABLE IF NOT EXISTS loads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fb_no TEXT UNIQUE NOT NULL,
  container_no TEXT,
  carrier_name TEXT,
  bol TEXT,
  origin TEXT,
  destination TEXT,
  shipment_date DATE,
  status TEXT,
  dispatch_sent_ts TIMESTAMP,
  no_show_flag INTEGER DEFAULT 0,
  invoice_no TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS drayage_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT UNIQUE NOT NULL,
  carrier_name TEXT,
  invoice_date DATE,
  fb_no TEXT,
  container_no TEXT,
  bol TEXT,
  origin TEXT,
  destination TEXT,
  base_rate REAL,
  fsc_pct REAL,
  fsc_amount REAL,
  accessorials_total REAL,
  grand_total REAL,
  status TEXT DEFAULT 'New',
  finding_tag TEXT,
  source_pdf TEXT,
  extraction_confidence REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drayage_invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL,
  line_no INTEGER,
  line_type TEXT,
  description TEXT,
  qty REAL,
  rate REAL,
  amount REAL
);

CREATE TABLE IF NOT EXISTS customs_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_no TEXT UNIQUE,
  broker_name TEXT,
  invoice_date DATE,
  container_no TEXT,
  po_no TEXT,
  entered_value REAL,
  hts_code TEXT,
  duty_rate TEXT,
  sec301_pct TEXT,
  sec232_pct TEXT,
  duty REAL,
  mpf REAL,
  hmf REAL,
  brokerage REAL,
  disbursement REAL,
  isf REAL,
  subtotal REAL,
  status TEXT DEFAULT 'Pending Review',
  finding_tag TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS gl_accruals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT,
  account_code TEXT,
  account_name TEXT,
  accrued REAL,
  actual REAL,
  variance REAL,
  status TEXT,
  posted_at TIMESTAMP,
  journal_entry_id TEXT
);

CREATE TABLE IF NOT EXISTS transfer_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id TEXT UNIQUE NOT NULL,
  from_dc TEXT,
  to_dc TEXT,
  mode TEXT,
  equipment TEXT,
  equipment_ref TEXT,
  sku_family TEXT,
  reason TEXT,
  need_by DATE,
  est_cost REAL,
  actual_cost REAL,
  status TEXT,
  costco_po_ref TEXT,
  requested_by TEXT,
  approved_by TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS p4_transfer_needs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  p4_request_id TEXT UNIQUE,
  from_dc TEXT,
  to_dc TEXT,
  sku_family TEXT,
  units INTEGER,
  need_by DATE,
  costco_po_ref TEXT,
  reason TEXT,
  status TEXT DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS audit_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT,
  source_id INTEGER,
  source_ref TEXT,
  rule_family TEXT,
  severity TEXT,
  dollars_at_risk REAL,
  description TEXT,
  recommended_action TEXT,
  status TEXT DEFAULT 'Open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS terminal_appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  terminal TEXT,
  equipment TEXT,
  next_available_date DATE,
  window TEXT,
  open_slots INTEGER,
  avg_wait_min INTEGER,
  system TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS carrier_capacity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carrier_name TEXT,
  lane_group TEXT,
  equipment TEXT,
  weekly_capacity INTEGER,
  this_week_committed INTEGER,
  available INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS per_diem_ladder (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  steamship_line TEXT,
  equipment TEXT,
  free_time_port INTEGER,
  free_time_consignee INTEGER,
  demurrage_d1_3 REAL,
  demurrage_d4_7 REAL,
  demurrage_d8_plus REAL,
  detention_d1_3 REAL,
  detention_d4_7 REAL,
  detention_d8_plus REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE,
  role TEXT,
  last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS container_tracking (
  container_no TEXT PRIMARY KEY,
  scac TEXT,
  request_type TEXT,
  request_number TEXT,
  tracking_request_id TEXT,
  shipment_id TEXT,
  status TEXT,
  pod_eta TEXT,
  pod_name TEXT,
  last_event TEXT,
  last_event_at TEXT,
  raw_json TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
