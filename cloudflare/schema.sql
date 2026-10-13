-- D1 schema for the enquiry backend (same fields as server.py, plus a hashed client id for rate limits).
CREATE TABLE IF NOT EXISTS enquiries (
  reference TEXT PRIMARY KEY, created_at TEXT NOT NULL, route TEXT NOT NULL,
  name TEXT NOT NULL, mobile TEXT NOT NULL, email TEXT, unit TEXT,
  visit_type TEXT, visit_date TEXT, visit_time TEXT, message TEXT,
  page TEXT, source TEXT, campaign TEXT, consent INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '', downloaded_at TEXT, ip_hash TEXT
);
CREATE TABLE IF NOT EXISTS limits (kind TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_limits ON limits (kind, ip, at);
