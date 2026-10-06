// Reusable, deterministic signal engine.
//
//   raw observation (job posting / news / website scan / registry / social)  ->  structured BusinessSignals
//
// Future crawlers only need to INSERT rows into raw_observations and call processPendingObservations();
// everything downstream (signal flags, opportunity score, AI analysis) is recomputed automatically.

import type Database from "better-sqlite3";
import { fold, type ObservationType, type SignalStrength, type SignalType } from "./constants";

export interface ObservationInput {
  observation_type: ObservationType | string;
  raw_text: string;
  title?: string | null;
}

export interface DetectedSignal {
  signal_type: SignalType;
  signal_strength: SignalStrength;
  description: string;
  quantity?: number | null;
}

/** Digital-profile facts that can be extracted from website / social observations. */
export interface ProfilePatch {
  website_exists?: number;
  website_quality_score?: number | null;
  website_mobile_friendly?: number | null;
  website_https?: number | null;
  website_last_updated_year?: number | null;
  facebook_page_exists?: number;
  linkedin_company_page_exists?: number;
  ecommerce_presence?: number;
  online_booking_available?: number;
  google_business_profile?: number;
}

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

const SALES_WORDS = ["sales", "kinh doanh", "business development", "telesales", "account executive", "tu van ban hang", "ban hang", "bd executive", "sale "];
const MARKETING_WORDS = ["marketing", "content", "seo", "social media", "truyen thong", "brand", "digital ads", "performance ads"];
const TECH_WORDS = ["engineer", "developer", "lap trinh", "software", "it support", "ky su phan mem", "data analyst", "devops", "frontend", "backend", "it staff"];
const SENIOR_WORDS = ["manager", "head of", "truong phong", "director", "giam doc", "lead"];

/** Extract the number of positions from a job posting ("Tuyển 10 nhân viên", "recruiting 3 sales staff"). */
export function extractQuantity(text: string): number | null {
  const t = fold(text);
  const m =
    t.match(/(?:tuyen|tuyen dung|recruiting|hiring|need|can)\s+(?:gap\s+)?(\d{1,3})\b/) ||
    t.match(/\b(\d{1,3})\s*(?:x\s*)?(?:nhan vien|nv|staff|people|positions?|nguoi|vi tri|sales|marketing|engineers?|developers?|ky thuat vien|cong nhan|giao vien|workers?|drivers?|tai xe|dieu duong|bac si|reps?|representatives?|executives?|specialists?)\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 && n < 1000 ? n : null;
}

function hiringStrength(qty: number, senior: boolean): SignalStrength {
  if (qty >= 5) return "HIGH";
  if (qty >= 2 || senior) return "MEDIUM";
  return "LOW";
}

function parseKV(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(/[;\n]/)) {
    const m = part.match(/([a-z_0-9]+)\s*=\s*([^;]+)/i);
    if (m) out[m[1].trim().toLowerCase()] = m[2].trim().toLowerCase();
  }
  return out;
}
const yes = (v?: string) => v === "yes" || v === "true" || v === "1";

/** Pure function: classify one observation into zero or more structured signals. */
export function detectSignals(obs: ObservationInput): { signals: DetectedSignal[]; profile: ProfilePatch } {
  const raw = `${obs.title ?? ""} ${obs.raw_text}`.trim();
  const t = fold(raw);
  const signals: DetectedSignal[] = [];
  const profile: ProfilePatch = {};
  const short = raw.length > 160 ? raw.slice(0, 157) + "..." : raw;

  switch (obs.observation_type) {
    case "JOB_POSTING": {
      const qty = extractQuantity(raw) ?? 1;
      const senior = has(t, SENIOR_WORDS);
      signals.push({ signal_type: "HIRING", signal_strength: hiringStrength(qty, senior), description: `Job posting: ${short}`, quantity: qty });
      if (has(t, SALES_WORDS))
        signals.push({ signal_type: "SALES_HIRING", signal_strength: qty >= 3 ? "HIGH" : hiringStrength(qty, senior), description: `Hiring ${qty} sales position(s): ${short}`, quantity: qty });
      if (has(t, MARKETING_WORDS))
        signals.push({ signal_type: "MARKETING_HIRING", signal_strength: qty >= 2 || senior ? "HIGH" : "MEDIUM", description: `Hiring ${qty} marketing position(s): ${short}`, quantity: qty });
      if (has(t, TECH_WORDS))
        signals.push({ signal_type: "TECH_HIRING", signal_strength: hiringStrength(qty, senior), description: `Hiring ${qty} technology position(s): ${short}`, quantity: qty });
      break;
    }
    case "NEWS":
    case "COMPANY_REGISTRY": {
      let matched = false;
      if (has(t, ["khai truong", "chi nhanh", "new branch", "branch", "showroom", "opens", "opened", "co so moi", "new store", "new clinic", "new location", "new campus", "new office", "van phong moi", "cua hang moi"])) {
        const strong = has(t, ["chi nhanh", "branch", "showroom", "thu ba", "third", "fourth", "thu tu", "flagship"]);
        signals.push({ signal_type: "NEW_BRANCH", signal_strength: strong ? "HIGH" : "MEDIUM", description: short });
        matched = true;
      }
      if (has(t, ["mo rong", "expand", "expansion", "nha may moi", "new factory", "nha xuong", "invest", "dau tu", "enters", "new market", "tang von", "capital increase", "capacity", "cong suat"])) {
        const strong = has(t, ["ty dong", "billion", "nha may", "factory", "usd", "million"]);
        signals.push({ signal_type: "EXPANSION", signal_strength: strong ? "HIGH" : "MEDIUM", description: short });
        matched = true;
      }
      if (has(t, ["ra mat", "launch", "new product", "san pham moi", "dich vu moi", "new service", "introduces"])) {
        signals.push({ signal_type: "PRODUCT_LAUNCH", signal_strength: "MEDIUM", description: short });
        matched = true;
      }
      if (obs.observation_type === "NEWS") {
        signals.push({ signal_type: "RECENT_NEWS", signal_strength: matched ? "MEDIUM" : "LOW", description: `In the news: ${short}` });
      }
      break;
    }
    case "WEBSITE_SCAN": {
      const kv = parseKV(raw);
      if (kv.status === "none" || kv.status === "404" || has(t, ["no website found", "khong co website"])) {
        profile.website_exists = 0;
        profile.website_quality_score = null;
        signals.push({ signal_type: "NO_WEBSITE", signal_strength: "HIGH", description: "No company website found in public search results" });
        break;
      }
      profile.website_exists = 1;
      const q = kv.quality_score ? parseInt(kv.quality_score, 10) : NaN;
      if (!Number.isNaN(q)) profile.website_quality_score = q;
      if (kv.mobile_friendly) profile.website_mobile_friendly = yes(kv.mobile_friendly) ? 1 : 0;
      if (kv.https) profile.website_https = yes(kv.https) ? 1 : 0;
      if (kv.online_booking) profile.online_booking_available = yes(kv.online_booking) ? 1 : 0;
      if (kv.ecommerce) profile.ecommerce_presence = yes(kv.ecommerce) ? 1 : 0;
      const year = kv.last_updated ? parseInt(kv.last_updated, 10) : NaN;
      if (!Number.isNaN(year)) profile.website_last_updated_year = year;

      const issues: string[] = [];
      if (kv.mobile_friendly && !yes(kv.mobile_friendly)) issues.push("not mobile-friendly");
      if (kv.https && !yes(kv.https)) issues.push("no HTTPS");
      if (!Number.isNaN(year) && year <= new Date().getFullYear() - 4) issues.push(`content last updated ${year}`);
      if (kv.load_time_s && parseFloat(kv.load_time_s) > 5) issues.push(`slow load (${kv.load_time_s}s)`);
      if (!Number.isNaN(q) && q < 50) {
        signals.push({
          signal_type: "WEBSITE_PROBLEM",
          signal_strength: q < 35 ? "HIGH" : "MEDIUM",
          description: `Website quality score ${q}/100${issues.length ? ` (${issues.join(", ")})` : ""}`,
        });
      } else if (issues.length >= 2) {
        signals.push({ signal_type: "WEBSITE_PROBLEM", signal_strength: "LOW", description: `Website issues detected: ${issues.join(", ")}` });
      }
      break;
    }
    case "SOCIAL_PRESENCE": {
      const kv = parseKV(raw);
      const fb = yes(kv.facebook_page);
      const li = yes(kv.linkedin_page);
      const gb = yes(kv.google_business_profile);
      if (kv.facebook_page) profile.facebook_page_exists = fb ? 1 : 0;
      if (kv.linkedin_page) profile.linkedin_company_page_exists = li ? 1 : 0;
      if (kv.google_business_profile) profile.google_business_profile = gb ? 1 : 0;
      if (kv.ecommerce) profile.ecommerce_presence = yes(kv.ecommerce) ? 1 : 0;
      const growth = kv.follower_growth_90d ? parseFloat(kv.follower_growth_90d) : 0;
      const followers = kv.facebook_followers ? parseInt(kv.facebook_followers, 10) : 0;
      if (growth >= 20 || (kv.new_channels && kv.new_channels !== "none")) {
        const parts = [];
        if (growth >= 20) parts.push(`social followers +${growth}% in 90 days`);
        if (kv.new_channels && kv.new_channels !== "none") parts.push(`new channel(s): ${kv.new_channels}`);
        signals.push({ signal_type: "DIGITAL_GROWTH", signal_strength: growth >= 40 ? "HIGH" : "MEDIUM", description: `Growing digital presence: ${parts.join("; ")}` });
      }
      const channels = [fb, li, gb].filter(Boolean).length;
      if (channels === 0 || (channels === 1 && followers > 0 && followers < 500)) {
        signals.push({ signal_type: "WEAK_DIGITAL_PRESENCE", signal_strength: channels === 0 ? "HIGH" : "MEDIUM", description: `Weak digital presence: ${channels} public channel(s)${followers ? `, ${followers} followers` : ""}` });
      }
      break;
    }
  }
  return { signals, profile };
}

// ---------------------------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------------------------

export const SIGNAL_WINDOW_DAYS = 180; // signals older than this no longer drive flags or score
export const NEWS_WINDOW_DAYS = 90;

/** Process one stored raw observation: create signals, patch the digital profile, mark processed. */
export function processObservation(db: Database.Database, observationId: number): DetectedSignal[] {
  const obs = db.prepare("SELECT * FROM raw_observations WHERE id = ?").get(observationId) as
    | { id: number; company_id: number; source_id: number | null; source_url: string | null; observation_type: string; title: string | null; raw_text: string; observed_at: string }
    | undefined;
  if (!obs) throw new Error(`Observation ${observationId} not found`);
  const { signals, profile } = detectSignals(obs);
  const insert = db.prepare(
    `INSERT INTO business_signals (company_id, observation_id, source_id, signal_type, signal_strength, description, source_url, quantity, detected_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'engine')`,
  );
  // Re-processing an observation replaces its previous signals (idempotent).
  db.prepare("DELETE FROM business_signals WHERE observation_id = ?").run(obs.id);
  for (const s of signals) {
    insert.run(obs.company_id, obs.id, obs.source_id, s.signal_type, s.signal_strength, s.description, obs.source_url, s.quantity ?? null, obs.observed_at);
  }
  applyProfilePatch(db, obs.company_id, profile, obs.observed_at);
  db.prepare("UPDATE raw_observations SET processed = 1, processed_at = datetime('now') WHERE id = ?").run(obs.id);
  return signals;
}

export function applyProfilePatch(db: Database.Database, companyId: number, patch: ProfilePatch, checkedAt?: string) {
  db.prepare("INSERT OR IGNORE INTO company_digital_profiles (company_id) VALUES (?)").run(companyId);
  const keys = Object.keys(patch) as (keyof ProfilePatch)[];
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE company_digital_profiles SET ${sets}, last_checked_at = @checked, updated_at = datetime('now') WHERE company_id = @id`).run({
    ...patch,
    checked: checkedAt ?? new Date().toISOString(),
    id: companyId,
  });
}

/** Recompute the denormalised signal flags on the company row from business_signals + digital profile. */
export function refreshCompanySignalFlags(db: Database.Database, companyId: number, now = new Date()) {
  const since = new Date(now.getTime() - SIGNAL_WINDOW_DAYS * 86400000).toISOString();
  const newsSince = new Date(now.getTime() - NEWS_WINDOW_DAYS * 86400000).toISOString();
  const rows = db
    .prepare("SELECT signal_type, quantity, detected_at FROM business_signals WHERE company_id = ? AND detected_at >= ?")
    .all(companyId, since) as { signal_type: SignalType; quantity: number | null; detected_at: string }[];
  const types = new Set(rows.map((r) => r.signal_type));
  const hiringCount = rows.filter((r) => r.signal_type === "HIRING").reduce((a, r) => a + (r.quantity ?? 1), 0);
  const latest = (db.prepare("SELECT MAX(detected_at) d FROM business_signals WHERE company_id = ?").get(companyId) as { d: string | null }).d;
  const profile = db.prepare("SELECT * FROM company_digital_profiles WHERE company_id = ?").get(companyId) as
    | { website_exists: number; facebook_page_exists: number; linkedin_company_page_exists: number; google_business_profile: number }
    | undefined;
  const hasWebsite = profile ? profile.website_exists === 1 : false;
  const channels = profile ? profile.facebook_page_exists + profile.linkedin_company_page_exists + profile.google_business_profile : 0;

  let digital: "STRONG" | "NEUTRAL" | "WEAK" = "NEUTRAL";
  if (types.has("DIGITAL_GROWTH")) digital = "STRONG";
  else if (types.has("WEAK_DIGITAL_PRESENCE") || (!hasWebsite && channels === 0)) digital = "WEAK";

  const news = rows.some((r) => r.signal_type === "RECENT_NEWS" && r.detected_at >= newsSince);
  db.prepare(
    `UPDATE companies SET
       hiring_signal = @hiring, hiring_count = @hiring_count, marketing_hiring_signal = @mkt, sales_hiring_signal = @sales,
       technology_hiring_signal = @tech, new_branch_signal = @branch, expansion_signal = @exp, recent_news_signal = @news,
       website_problem_signal = @web, digital_presence_signal = @digital, latest_signal_date = @latest
     WHERE id = @id`,
  ).run({
    id: companyId,
    hiring: types.has("HIRING") || types.has("SALES_HIRING") || types.has("MARKETING_HIRING") || types.has("TECH_HIRING") ? 1 : 0,
    hiring_count: hiringCount,
    mkt: types.has("MARKETING_HIRING") ? 1 : 0,
    sales: types.has("SALES_HIRING") ? 1 : 0,
    tech: types.has("TECH_HIRING") ? 1 : 0,
    branch: types.has("NEW_BRANCH") ? 1 : 0,
    exp: types.has("EXPANSION") ? 1 : 0,
    news: news ? 1 : 0,
    web: types.has("WEBSITE_PROBLEM") ? 1 : 0,
    digital,
    latest,
  });
}

/** Process all unprocessed observations (what a crawler pipeline would call after inserting rows). */
export function processPendingObservations(db: Database.Database): { observations: number; signals: number; companies: number[] } {
  const pending = db.prepare("SELECT id, company_id FROM raw_observations WHERE processed = 0 ORDER BY observed_at").all() as { id: number; company_id: number }[];
  let count = 0;
  const companies = new Set<number>();
  for (const p of pending) {
    count += processObservation(db, p.id).length;
    companies.add(p.company_id);
  }
  return { observations: pending.length, signals: count, companies: [...companies] };
}
