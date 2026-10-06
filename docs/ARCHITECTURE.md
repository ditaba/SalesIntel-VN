# Architecture

## Overview

```
┌──────────────────────────── Next.js 15 (single deployable) ────────────────────────────┐
│  UI (React server components + small client islands)                                    │
│    Dashboard · Companies (filters) · Company page · AI Search · Saved Leads · Signals ·  │
│    Admin (CRUD, ingestion, sources, CSV import)                                          │
│                                                                                          │
│  Route handlers /api/*  ── middleware (JWT cookie, admin gating)                         │
│                                                                                          │
│  Domain libraries (src/lib)                                                              │
│    signals.ts   raw observation ──► structured signals (+ digital-profile patch)         │
│    scoring.ts   signal flags + profile ──► deterministic Opportunity Score (rules-v1)    │
│    analysis.ts  facts (data) + narrative (rules engine or Claude) ──► stored AI fields   │
│    search.ts    SearchFilters ──► parameterised SQL + FTS5                               │
│    nlsearch.ts  question ──► SearchFilters (rules or Claude JSON) ──► search.ts          │
│    importer.ts  CSV ──► validate / normalise / dedupe ──► insert ──► score               │
│    seed.ts      synthetic demo dataset, generated as raw observations                    │
│                                                                                          │
│  SQLite (better-sqlite3, WAL, FTS5)                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Data pipeline (designed for future crawlers)

```
DataSource (legal + robots review)
   │  crawler / API client / CSV / admin
   ▼
raw_observations  (company_id, source_id, source_url, observation_type, raw_text, observed_at, processed)
   │  processObservation()  ← signals.ts (pure detectSignals() + persistence)
   ▼
business_signals  (signal_type, signal_strength, description, quantity, source_url, detected_at)
company_digital_profiles  (patched by WEBSITE_SCAN / SOCIAL_PRESENCE observations)
   │  refreshCompanySignalFlags()  → denormalised flags on companies (fast filtering)
   ▼
computeOpportunityScore()  → companies.ai_opportunity_score/level + opportunity_scores (audit history)
   ▼
rulesAnalysis() / llmAnalysis()  → ai_facts, ai_inferences, ai_why_now, ai_recommended_services, ai_recommended_sales_pitch
```

A new crawler only needs to:

1. Register a `data_sources` row. It cannot be activated until `legal_review_status ∈ {APPROVED, NOT_REQUIRED}` and `robots_review_status ∉ {PENDING, DISALLOWED}`; `POST/PATCH /api/admin/sources` enforces this.
2. Insert rows into `raw_observations`, always with a `source_url`.
3. Call `processPendingObservations(db)` and `recomputeCompany(db, id)`, or `POST /api/admin/recalculate`.

`POST /api/admin/observations` is the same entry point, exposed for single observations. The Admin company page uses it to demonstrate the engine live.

Every signal keeps `source_id`, `source_url` and `observation_id`. Every company keeps `public_source_url`. The company page lists every source with its last-checked date.

## Database schema

All tables have integer primary keys and timestamps. Foreign keys cascade on delete. The DDL is in `src/lib/schema.ts`.

| Table | Purpose | Key columns / indexes |
|---|---|---|
| `users` | Accounts | `email` UNIQUE, `role` CHECK (user/admin), bcrypt `password_hash` |
| `password_resets` | One-time reset tokens (1 h) | `token` UNIQUE, FK users |
| `companies` | Core company record plus denormalised signal flags and AI fields | `tax_code` UNIQUE; indexes on (province, district), industry, score DESC, level, latest_signal_date, employee_range_order, last_updated_at, name |
| `companies_fts` | FTS5 virtual table over diacritic-folded `search_text` | kept in sync by triggers |
| `company_digital_profiles` | Website existence/quality/mobile/HTTPS, Facebook, LinkedIn, Google Business, e-commerce, booking | PK = FK company_id |
| `data_sources` | Source registry plus compliance status | `source_name` UNIQUE, legal/robots CHECK enums, `rate_limit_per_minute`, `last_crawled_at` |
| `raw_observations` | Unprocessed public observations | FK company, FK source; indexes on company_id and processed |
| `business_signals` | Structured signals | FK company/observation/source; indexes on (company_id, detected_at), signal_type, detected_at |
| `opportunity_scores` | Score history with JSON rule breakdown and model version | index (company_id, calculated_at) |
| `saved_lists` | User lead lists | UNIQUE (user_id, name) |
| `saved_companies` | List membership | UNIQUE (list_id, company_id), index company_id |

Signal flags are deliberately denormalised onto `companies`: `hiring_signal`, `hiring_count`, `marketing_hiring_signal`, `sales_hiring_signal`, `technology_hiring_signal`, `new_branch_signal`, `expansion_signal`, `recent_news_signal`, `website_problem_signal`, `digital_presence_signal` and `latest_signal_date`. Filters can then use plain indexed predicates instead of `EXISTS` sub-queries over the signals table. The engine always recomputes them from `business_signals`, so they never become a second source of truth.

## AI design

- **The score is deterministic.** `scoring.ts` is a pure function with a documented rule table. AI explains the score and never sets it.
- **Facts vs inference.** `buildFacts()` produces only data-backed statements, each with a date and source. Inferences are generated separately with hedged language and are shown in a separate, visually distinct panel.
- **Claude is optional.** When `ANTHROPIC_API_KEY` is set:
  - `llmAnalysis()` sends the verified facts, score breakdown and candidate services, and gets back a JSON narrative (structured outputs). The facts list and score are never replaced.
  - `parseQueryLLM()` returns filter JSON constrained by an enum schema. The server whitelists every value again before building SQL.
  - Any API error, refusal or timeout falls back to the rules engine.
- **No hallucinated companies.** NL search only produces filters. Results always come from SQL, and the answer text is built from the returned rows.

## Search scaling plan

| Scale | Engine | Notes |
|---|---|---|
| **MVP → ~100K companies** | SQLite + FTS5 (current) | Indexed equality/range predicates on denormalised flags plus an FTS5 prefix match on diacritic-folded text. Single-digit-ms queries at this size. Single node. |
| **100K → ~1M** | **PostgreSQL full-text search** | Same schema. `search_text` becomes a generated `tsvector` column with a GIN index, using the `unaccent` extension for Vietnamese diacritics and `pg_trgm` for fuzzy company-name matching. Composite B-tree indexes on (province, industry, ai_opportunity_score DESC). Facet counts come from materialised views refreshed after scoring. Read replicas for search, primary for writes. `search.ts` keeps the same `SearchFilters → SQL` contract, so only the dialect changes. |
| **1M → 10M+** | **OpenSearch / Elasticsearch** | Postgres stays the system of record. A change-data-capture stream (logical replication or Debezium, or an outbox table) indexes one denormalised document per company: profile, flags, score and the latest N signals. Benefits: fast multi-facet aggregations (counts per province/industry/signal), BM25 plus a Vietnamese analyzer (ICU folding, with `vi` tokenisation via a plugin), geo queries, and vector fields for semantic "companies like this" search. `searchCompanies()` gains an OpenSearch implementation behind the same interface, and NL search still emits `SearchFilters`. |

Other scaling notes:

- Run scoring as a batch job over changed companies only. `processPendingObservations` returns the affected company IDs.
- Partition `business_signals` and `raw_observations` by month in Postgres. Archive raw text to object storage after processing.
- Cache dashboard aggregates (they are global) for 1–5 minutes.

## Security and compliance

- Passwords are bcrypt-hashed. Sessions are signed JWTs in httpOnly, SameSite=Lax cookies (Secure in production).
- Middleware blocks unauthenticated pages and APIs. Admin pages and APIs require `role = admin`, checked in middleware and again in every handler.
- All SQL is parameterised. Filter values are whitelisted against enums. FTS queries are tokenised and quoted.
- Company-level public information only. No personal contact data is modelled. The data-source registry enforces legal and robots review before activation. The MVP performs no outbound crawling.
