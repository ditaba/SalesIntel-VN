// Company search: structured filters -> parameterised SQL (+ FTS5 keyword search).
// The same SearchFilters object is produced by the filter sidebar (URL params) and by the
// natural-language AI search, so both always return real database records.

import type Database from "better-sqlite3";
import { EMPLOYEE_RANGES, fold, INDUSTRIES, OPPORTUNITY_LEVELS } from "./constants";
import type { CompanyListRow } from "./types";

export type WebsiteFilter = "has" | "none" | "low" | "needs";
export type HiringFilter = "any" | "sales" | "marketing" | "tech";
export type SignalFilter = "new_branch" | "expansion" | "news" | "digital_growth" | "weak_digital" | "product_launch";
export type SortKey = "score" | "signal" | "size" | "updated" | "name";

export interface SearchFilters {
  q?: string;
  province?: string;
  district?: string;
  industry?: string[];
  size?: string[];
  website?: WebsiteFilter;
  hiring?: HiringFilter[];
  signals?: SignalFilter[];
  /** new branch OR expansion (used by NL search for "expanding / growing") */
  growthAny?: boolean;
  level?: string[];
  minScore?: number;
  minEmployeesOrder?: number;
  signalWithinDays?: number;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export const WEBSITE_OPTIONS: { value: WebsiteFilter; label: string }[] = [
  { value: "has", label: "Has website" },
  { value: "none", label: "No website" },
  { value: "low", label: "Low website quality" },
  { value: "needs", label: "No or weak website" },
];
export const HIRING_OPTIONS: { value: HiringFilter; label: string }[] = [
  { value: "any", label: "Currently hiring" },
  { value: "sales", label: "Hiring sales" },
  { value: "marketing", label: "Hiring marketing" },
  { value: "tech", label: "Hiring engineers" },
];
export const SIGNAL_OPTIONS: { value: SignalFilter; label: string }[] = [
  { value: "new_branch", label: "Recently opened branch" },
  { value: "expansion", label: "Expansion detected" },
  { value: "news", label: "Recent company news" },
  { value: "product_launch", label: "New product launch" },
  { value: "digital_growth", label: "Strong digital growth" },
  { value: "weak_digital", label: "Weak digital presence" },
];

const LOW_QUALITY = 50;

const csv = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v : v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean);

/** Parse URLSearchParams / Next searchParams into validated filters (whitelisted values only). */
export function filtersFromParams(sp: Record<string, string | string[] | undefined>): SearchFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) || undefined;
  const f: SearchFilters = {
    q: one("q")?.slice(0, 200),
    province: one("province"),
    district: one("district"),
    industry: csv(sp.industry as string).filter((i) => (INDUSTRIES as readonly string[]).includes(i)),
    size: csv(sp.size as string).filter((s) => (EMPLOYEE_RANGES as readonly string[]).includes(s)),
    website: (["has", "none", "low", "needs"] as const).find((w) => w === one("website")),
    hiring: csv(sp.hiring as string).filter((h): h is HiringFilter => HIRING_OPTIONS.some((o) => o.value === h)),
    signals: csv(sp.signals as string).filter((s): s is SignalFilter => SIGNAL_OPTIONS.some((o) => o.value === s)),
    level: csv(sp.level as string).filter((l) => (OPPORTUNITY_LEVELS as readonly string[]).includes(l)),
    sort: (["score", "signal", "size", "updated", "name"] as const).find((s) => s === one("sort")) ?? "score",
    page: Math.max(1, parseInt(one("page") ?? "1", 10) || 1),
    growthAny: one("growth") === "1" || undefined,
  };
  const ms = parseInt(one("minScore") ?? "", 10);
  if (!Number.isNaN(ms)) f.minScore = ms;
  const sd = parseInt(one("within") ?? "", 10);
  if (!Number.isNaN(sd)) f.signalWithinDays = sd;
  return f;
}

export function filtersToParams(f: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.province) p.set("province", f.province);
  if (f.district) p.set("district", f.district);
  if (f.industry?.length) p.set("industry", f.industry.join(","));
  if (f.size?.length) p.set("size", f.size.join(","));
  if (f.website) p.set("website", f.website);
  if (f.hiring?.length) p.set("hiring", f.hiring.join(","));
  if (f.signals?.length) p.set("signals", f.signals.join(","));
  if (f.level?.length) p.set("level", f.level.join(","));
  if (f.minScore != null) p.set("minScore", String(f.minScore));
  if (f.signalWithinDays != null) p.set("within", String(f.signalWithinDays));
  if (f.growthAny) p.set("growth", "1");
  if (f.sort && f.sort !== "score") p.set("sort", f.sort);
  return p;
}

/** Turn free text into a safe FTS5 prefix query: "beauty hcm" -> "beauty"* "hcm"* */
export function ftsQuery(q: string): string | null {
  const tokens = fold(q)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 1)
    .slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"*`).join(" ");
}

export function buildWhere(f: SearchFilters, now = new Date()): { where: string; params: Record<string, unknown> } {
  const w: string[] = [];
  const params: Record<string, unknown> = {};
  if (f.q) {
    const fq = ftsQuery(f.q);
    if (fq) {
      w.push("c.id IN (SELECT rowid FROM companies_fts WHERE companies_fts MATCH @fts)");
      params.fts = fq;
    }
  }
  if (f.province) {
    w.push("c.province = @province");
    params.province = f.province;
  }
  if (f.district) {
    w.push("c.district = @district");
    params.district = f.district;
  }
  if (f.industry?.length) {
    w.push(`c.industry IN (${f.industry.map((_, i) => `@ind${i}`).join(",")})`);
    f.industry.forEach((v, i) => (params[`ind${i}`] = v));
  }
  if (f.size?.length) {
    w.push(`c.estimated_employee_range IN (${f.size.map((_, i) => `@size${i}`).join(",")})`);
    f.size.forEach((v, i) => (params[`size${i}`] = v));
  }
  if (f.minEmployeesOrder) {
    w.push("c.employee_range_order >= @minOrder");
    params.minOrder = f.minEmployeesOrder;
  }
  switch (f.website) {
    case "has":
      w.push("p.website_exists = 1");
      break;
    case "none":
      w.push("COALESCE(p.website_exists, 0) = 0");
      break;
    case "low":
      w.push(`p.website_exists = 1 AND p.website_quality_score < ${LOW_QUALITY}`);
      break;
    case "needs":
      w.push(`(COALESCE(p.website_exists, 0) = 0 OR p.website_quality_score < ${LOW_QUALITY})`);
      break;
  }
  for (const h of f.hiring ?? []) {
    if (h === "any") w.push("c.hiring_signal = 1");
    if (h === "sales") w.push("c.sales_hiring_signal = 1");
    if (h === "marketing") w.push("c.marketing_hiring_signal = 1");
    if (h === "tech") w.push("c.technology_hiring_signal = 1");
  }
  for (const s of f.signals ?? []) {
    if (s === "new_branch") w.push("c.new_branch_signal = 1");
    if (s === "expansion") w.push("c.expansion_signal = 1");
    if (s === "news") w.push("c.recent_news_signal = 1");
    if (s === "digital_growth") w.push("c.digital_presence_signal = 'STRONG'");
    if (s === "weak_digital") w.push("c.digital_presence_signal = 'WEAK'");
    if (s === "product_launch") w.push("EXISTS (SELECT 1 FROM business_signals bs WHERE bs.company_id = c.id AND bs.signal_type = 'PRODUCT_LAUNCH')");
  }
  if (f.growthAny) w.push("(c.new_branch_signal = 1 OR c.expansion_signal = 1)");
  if (f.level?.length) {
    w.push(`c.ai_opportunity_level IN (${f.level.map((_, i) => `@lvl${i}`).join(",")})`);
    f.level.forEach((v, i) => (params[`lvl${i}`] = v));
  }
  if (f.minScore != null) {
    w.push("c.ai_opportunity_score >= @minScore");
    params.minScore = f.minScore;
  }
  if (f.signalWithinDays != null) {
    w.push("c.latest_signal_date >= @since");
    params.since = new Date(now.getTime() - f.signalWithinDays * 86400000).toISOString();
  }
  return { where: w.length ? `WHERE ${w.join(" AND ")}` : "", params };
}

const ORDER: Record<SortKey, string> = {
  score: "c.ai_opportunity_score DESC, c.latest_signal_date DESC",
  signal: "c.latest_signal_date IS NULL, c.latest_signal_date DESC, c.ai_opportunity_score DESC",
  size: "c.employee_range_order DESC, c.ai_opportunity_score DESC",
  updated: "c.last_updated_at DESC, c.id DESC",
  name: "c.company_name COLLATE NOCASE ASC",
};

export function searchCompanies(db: Database.Database, f: SearchFilters): { rows: CompanyListRow[]; total: number; page: number; pageSize: number } {
  const { where, params } = buildWhere(f);
  const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 25));
  const page = Math.max(1, f.page ?? 1);
  const from = "FROM companies c LEFT JOIN company_digital_profiles p ON p.company_id = c.id";
  const total = (db.prepare(`SELECT COUNT(*) n ${from} ${where}`).get(params) as { n: number }).n;
  const rows = db
    .prepare(`SELECT c.*, p.website_exists, p.website_quality_score ${from} ${where} ORDER BY ${ORDER[f.sort ?? "score"]} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as CompanyListRow[];
  return { rows, total, page, pageSize };
}

/** Facet counts for the sidebar (computed over the current result set minus that facet). */
export function provinceDistricts(db: Database.Database, province: string): string[] {
  return (db.prepare("SELECT DISTINCT district FROM companies WHERE province = ? AND district IS NOT NULL ORDER BY district").all(province) as { district: string }[]).map((r) => r.district);
}

export function badgesFor(c: CompanyListRow | (CompanyListRow & Record<string, unknown>)): { key: string; label: string; tone: string }[] {
  const b: { key: string; label: string; tone: string }[] = [];
  if (c.new_branch_signal) b.push({ key: "NEW_BRANCH", label: "New Branch", tone: "green" });
  if (c.expansion_signal) b.push({ key: "EXPANSION", label: "Expanding", tone: "emerald" });
  if (c.hiring_signal) b.push({ key: "HIRING", label: c.hiring_count > 1 ? `Hiring (${c.hiring_count})` : "Hiring", tone: "blue" });
  if (c.sales_hiring_signal) b.push({ key: "SALES_HIRING", label: "Sales Hiring", tone: "violet" });
  if (c.marketing_hiring_signal) b.push({ key: "MARKETING_HIRING", label: "Marketing Hiring", tone: "pink" });
  if (c.technology_hiring_signal) b.push({ key: "TECH_HIRING", label: "Tech Hiring", tone: "cyan" });
  if (c.website_exists === 0) b.push({ key: "NO_WEBSITE", label: "No Website", tone: "red" });
  else if (c.website_quality_score != null && c.website_quality_score < LOW_QUALITY) b.push({ key: "WEBSITE_PROBLEM", label: "Weak Website", tone: "red" });
  if (c.recent_news_signal) b.push({ key: "RECENT_NEWS", label: "Recent News", tone: "slate" });
  if (c.digital_presence_signal === "STRONG") b.push({ key: "DIGITAL_GROWTH", label: "Digital Growth", tone: "teal" });
  if (c.digital_presence_signal === "WEAK") b.push({ key: "WEAK_DIGITAL_PRESENCE", label: "Weak Digital", tone: "orange" });
  return b;
}
