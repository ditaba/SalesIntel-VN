import type Database from "better-sqlite3";
import type { CompanyRow, SignalRow } from "./types";

export function dashboardStats(db: Database.Database, userId: number) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const one = <T,>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T;
  const total = one<{ n: number }>("SELECT COUNT(*) n FROM companies").n;
  const high = one<{ n: number }>("SELECT COUNT(*) n FROM companies WHERE ai_opportunity_level = 'HIGH'").n;
  const medium = one<{ n: number }>("SELECT COUNT(*) n FROM companies WHERE ai_opportunity_level = 'MEDIUM'").n;
  const newSignals = one<{ n: number }>("SELECT COUNT(*) n FROM business_signals WHERE detected_at >= ?", weekAgo).n;
  const newSignalCompanies = one<{ n: number }>("SELECT COUNT(DISTINCT company_id) n FROM business_signals WHERE detected_at >= ?", weekAgo).n;
  const saved = one<{ n: number }>(
    "SELECT COUNT(DISTINCT sc.company_id) n FROM saved_companies sc JOIN saved_lists l ON l.id = sc.list_id WHERE l.user_id = ?",
    userId,
  ).n;
  const lists = one<{ n: number }>("SELECT COUNT(*) n FROM saved_lists WHERE user_id = ?", userId).n;

  const topIndustries = db
    .prepare(
      `SELECT industry label, COUNT(*) value FROM companies WHERE ai_opportunity_level IN ('HIGH','MEDIUM')
       GROUP BY industry ORDER BY value DESC LIMIT 8`,
    )
    .all() as { label: string; value: number }[];
  const topLocations = db
    .prepare(
      `SELECT province label, COUNT(*) value FROM companies WHERE ai_opportunity_level IN ('HIGH','MEDIUM')
       GROUP BY province ORDER BY value DESC LIMIT 8`,
    )
    .all() as { label: string; value: number }[];
  const buckets = db.prepare("SELECT MIN(ai_opportunity_score / 10, 9) b, COUNT(*) n FROM companies GROUP BY b").all() as { b: number; n: number }[];
  const distribution = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i === 9 ? 100 : i * 10 + 9}`, value: buckets.find((x) => x.b === i)?.n ?? 0 }));
  const signalTypes = db
    .prepare(
      `SELECT signal_type label, COUNT(*) value FROM business_signals WHERE detected_at >= ?
       AND signal_type NOT IN ('RECENT_NEWS') GROUP BY signal_type ORDER BY value DESC`,
    )
    .all(new Date(Date.now() - 30 * 86400000).toISOString()) as { label: string; value: number }[];

  const latestSignals = db
    .prepare(
      `SELECT s.*, c.short_name, c.company_name, c.province, c.ai_opportunity_score, c.ai_opportunity_level
       FROM business_signals s JOIN companies c ON c.id = s.company_id
       WHERE s.signal_type NOT IN ('RECENT_NEWS','WEAK_DIGITAL_PRESENCE','NO_WEBSITE','WEBSITE_PROBLEM')
       ORDER BY s.detected_at DESC LIMIT 10`,
    )
    .all() as (SignalRow & Pick<CompanyRow, "short_name" | "company_name" | "province" | "ai_opportunity_score" | "ai_opportunity_level">)[];
  const topOpportunities = db
    .prepare(
      `SELECT id, short_name, company_name, industry, province, ai_opportunity_score, ai_opportunity_level, latest_signal_date, ai_why_now
       FROM companies ORDER BY ai_opportunity_score DESC, latest_signal_date DESC LIMIT 10`,
    )
    .all() as Pick<CompanyRow, "id" | "short_name" | "company_name" | "industry" | "province" | "ai_opportunity_score" | "ai_opportunity_level" | "latest_signal_date" | "ai_why_now">[];
  const contactToday = db
    .prepare(
      `SELECT id, short_name, company_name, industry, province, ai_opportunity_score, ai_opportunity_level, latest_signal_date, ai_why_now, ai_recommended_services
       FROM companies WHERE latest_signal_date >= ? AND ai_opportunity_score >= 60
       ORDER BY ai_opportunity_score DESC, latest_signal_date DESC LIMIT 3`,
    )
    .all(new Date(Date.now() - 14 * 86400000).toISOString()) as (Pick<CompanyRow, "id" | "short_name" | "company_name" | "industry" | "province" | "ai_opportunity_score" | "ai_opportunity_level" | "latest_signal_date" | "ai_why_now" | "ai_recommended_services">)[];

  return { total, high, medium, newSignals, newSignalCompanies, saved, lists, topIndustries, topLocations, distribution, signalTypes, latestSignals, topOpportunities, contactToday };
}
