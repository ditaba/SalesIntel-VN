// Relational schema (SQLite dialect, written to be portable to PostgreSQL).
// See docs/ARCHITECTURE.md for the PostgreSQL / OpenSearch migration path.

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS companies (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_code                  TEXT UNIQUE,
  company_name              TEXT NOT NULL,
  short_name                TEXT,
  industry                  TEXT NOT NULL,
  business_description      TEXT,
  province                  TEXT NOT NULL,
  district                  TEXT,
  address                   TEXT,
  website                   TEXT,
  company_status            TEXT NOT NULL DEFAULT 'Active',
  founded_date              TEXT,
  estimated_employee_range  TEXT,
  employee_range_order      INTEGER NOT NULL DEFAULT 0,
  legal_entity_type         TEXT,
  public_source_url         TEXT,
  is_demo                   INTEGER NOT NULL DEFAULT 1,

  -- Denormalised signal flags, maintained by the signal engine (refreshCompanySignalFlags)
  hiring_signal             INTEGER NOT NULL DEFAULT 0,
  hiring_count              INTEGER NOT NULL DEFAULT 0,
  marketing_hiring_signal   INTEGER NOT NULL DEFAULT 0,
  sales_hiring_signal       INTEGER NOT NULL DEFAULT 0,
  technology_hiring_signal  INTEGER NOT NULL DEFAULT 0,
  new_branch_signal         INTEGER NOT NULL DEFAULT 0,
  expansion_signal          INTEGER NOT NULL DEFAULT 0,
  recent_news_signal        INTEGER NOT NULL DEFAULT 0,
  website_problem_signal    INTEGER NOT NULL DEFAULT 0,
  digital_presence_signal   TEXT NOT NULL DEFAULT 'NEUTRAL' CHECK (digital_presence_signal IN ('STRONG','NEUTRAL','WEAK')),
  latest_signal_date        TEXT,

  -- AI / scoring fields (score is deterministic; text is AI or rules generated)
  ai_company_summary        TEXT,
  ai_opportunity_score      INTEGER NOT NULL DEFAULT 0,
  ai_opportunity_level      TEXT NOT NULL DEFAULT 'LOW',
  ai_sales_reasons          TEXT,   -- JSON array of strings
  ai_recommended_services   TEXT,   -- JSON array of strings
  ai_recommended_sales_pitch TEXT,
  ai_why_now                TEXT,
  ai_facts                  TEXT,   -- JSON array of verified facts
  ai_inferences             TEXT,   -- JSON array of AI inferences
  ai_generated_by           TEXT,
  ai_generated_at           TEXT,

  search_text               TEXT,   -- diacritic-folded text used by FTS
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  last_updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_companies_province  ON companies(province, district);
CREATE INDEX IF NOT EXISTS idx_companies_industry  ON companies(industry);
CREATE INDEX IF NOT EXISTS idx_companies_score     ON companies(ai_opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_companies_level     ON companies(ai_opportunity_level);
CREATE INDEX IF NOT EXISTS idx_companies_signal_dt ON companies(latest_signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_companies_size      ON companies(employee_range_order);
CREATE INDEX IF NOT EXISTS idx_companies_updated   ON companies(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_name      ON companies(company_name);

CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts USING fts5(
  search_text, content='companies', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS companies_ai AFTER INSERT ON companies BEGIN
  INSERT INTO companies_fts(rowid, search_text) VALUES (new.id, new.search_text);
END;
CREATE TRIGGER IF NOT EXISTS companies_ad AFTER DELETE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts, rowid, search_text) VALUES ('delete', old.id, old.search_text);
END;
CREATE TRIGGER IF NOT EXISTS companies_au AFTER UPDATE OF search_text ON companies BEGIN
  INSERT INTO companies_fts(companies_fts, rowid, search_text) VALUES ('delete', old.id, old.search_text);
  INSERT INTO companies_fts(rowid, search_text) VALUES (new.id, new.search_text);
END;

CREATE TABLE IF NOT EXISTS company_digital_profiles (
  company_id                  INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  website_exists              INTEGER NOT NULL DEFAULT 0,
  website_quality_score       INTEGER,          -- 0-100, NULL = not assessed
  website_mobile_friendly     INTEGER,
  website_https               INTEGER,
  website_last_updated_year   INTEGER,
  facebook_page_exists        INTEGER NOT NULL DEFAULT 0,
  linkedin_company_page_exists INTEGER NOT NULL DEFAULT 0,
  ecommerce_presence          INTEGER NOT NULL DEFAULT 0,
  online_booking_available    INTEGER NOT NULL DEFAULT 0,
  google_business_profile     INTEGER NOT NULL DEFAULT 0,
  last_checked_at             TEXT,
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_sources (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name           TEXT NOT NULL UNIQUE,
  source_type           TEXT NOT NULL,       -- DEMO, REGISTRY, JOB_BOARD, NEWS, WEBSITE, MANUAL, CSV_IMPORT
  base_url              TEXT,
  description           TEXT,
  is_active             INTEGER NOT NULL DEFAULT 0,
  legal_review_status   TEXT NOT NULL DEFAULT 'PENDING' CHECK (legal_review_status IN ('PENDING','APPROVED','REJECTED','NOT_REQUIRED')),
  robots_review_status  TEXT NOT NULL DEFAULT 'PENDING' CHECK (robots_review_status IN ('PENDING','ALLOWED','DISALLOWED','NOT_APPLICABLE')),
  rate_limit_per_minute INTEGER,
  last_crawled_at       TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS raw_observations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_id        INTEGER REFERENCES data_sources(id) ON DELETE SET NULL,
  source_url       TEXT,
  observation_type TEXT NOT NULL,
  title            TEXT,
  raw_text         TEXT NOT NULL,
  observed_at      TEXT NOT NULL,
  processed        INTEGER NOT NULL DEFAULT 0,
  processed_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_obs_company   ON raw_observations(company_id);
CREATE INDEX IF NOT EXISTS idx_obs_processed ON raw_observations(processed);

CREATE TABLE IF NOT EXISTS business_signals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  observation_id  INTEGER REFERENCES raw_observations(id) ON DELETE SET NULL,
  source_id       INTEGER REFERENCES data_sources(id) ON DELETE SET NULL,
  signal_type     TEXT NOT NULL,
  signal_strength TEXT NOT NULL CHECK (signal_strength IN ('HIGH','MEDIUM','LOW')),
  description     TEXT NOT NULL,
  source_url      TEXT,
  quantity        INTEGER,          -- e.g. number of positions for hiring signals
  detected_at     TEXT NOT NULL,
  created_by      TEXT NOT NULL DEFAULT 'engine',   -- engine | admin | import
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_signals_company  ON business_signals(company_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_type     ON business_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_detected ON business_signals(detected_at DESC);

CREATE TABLE IF NOT EXISTS opportunity_scores (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  score          INTEGER NOT NULL,
  level          TEXT NOT NULL,
  raw_points     INTEGER NOT NULL,
  breakdown      TEXT NOT NULL,     -- JSON [{rule,label,points}]
  model_version  TEXT NOT NULL,
  calculated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scores_company ON opportunity_scores(company_id, calculated_at DESC);

CREATE TABLE IF NOT EXISTS saved_lists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS saved_companies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id     INTEGER NOT NULL REFERENCES saved_lists(id) ON DELETE CASCADE,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (list_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_company ON saved_companies(company_id);
`;
