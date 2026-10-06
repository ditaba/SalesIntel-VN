// Company analysis: FACTS (verifiable, from data) vs INFERENCE (hedged interpretation).
// The deterministic generator always runs; Claude (if configured) rewrites the narrative from the
// same facts but can never change facts or the score.

import type Database from "better-sqlite3";
import { SIGNAL_TYPES, type SignalType } from "./constants";
import { callClaudeJSON, AI_MODEL } from "./llm";
import { computeOpportunityScore, SCORE_MODEL_VERSION, type ScoreResult } from "./scoring";
import { refreshCompanySignalFlags } from "./signals";
import type { CompanyRow, DigitalProfile, SignalRow } from "./types";

export interface Analysis {
  summary: string;
  why_now: string;
  facts: string[];
  inferences: string[];
  reasons: string[];
  services: string[];
  pitch: string;
  generated_by: string;
}

const INDUSTRY_NOUN: Record<string, string> = {
  "Beauty / Salon": "beauty & salon business",
  Restaurant: "food & beverage business",
  Retail: "retailer",
  Manufacturing: "manufacturer",
  Logistics: "logistics provider",
  "Real Estate": "real estate company",
  Education: "education provider",
  "Healthcare / Clinic": "healthcare clinic",
  Technology: "technology company",
  Construction: "construction company",
  Hospitality: "hospitality business",
  "Professional Services": "professional services firm",
};

const SIZE_WORD: Record<string, string> = {
  "1-10": "small",
  "11-50": "small-to-mid-sized",
  "51-200": "mid-sized",
  "201-500": "large",
  "500+": "large-scale",
};

const fmtDate = (iso: string) => iso.slice(0, 10);
const name = (c: CompanyRow) => c.short_name || c.company_name;
const latestOf = (signals: SignalRow[], type: SignalType) => signals.find((s) => s.signal_type === type);

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Verifiable statements derived directly from stored data (each traceable to a signal or profile field). */
export function buildFacts(c: CompanyRow, p: DigitalProfile | undefined, signals: SignalRow[], score: ScoreResult): string[] {
  const facts: string[] = [];
  facts.push(`${c.industry} company located in ${c.district ? c.district + ", " : ""}${c.province}`);
  if (c.estimated_employee_range) facts.push(`Estimated ${c.estimated_employee_range} employees`);
  if (c.founded_date) facts.push(`Founded ${c.founded_date.slice(0, 4)}`);
  const seen = new Set<string>();
  for (const s of signals) {
    if (["HIRING", "RECENT_NEWS"].includes(s.signal_type) && signals.some((o) => o.observation_id && o.observation_id === s.observation_id && o.id !== s.id))
      continue; // the more specific signal from the same observation already covers it
    const key = `${s.signal_type}:${s.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(`${fmtDate(s.detected_at)} — ${SIGNAL_TYPES[s.signal_type as SignalType]?.label ?? s.signal_type}: ${s.description}`);
    if (facts.length >= 12) break;
  }
  if (p) {
    if (!p.website_exists) facts.push("No company website found");
    else if (p.website_quality_score != null) facts.push(`Website quality score ${p.website_quality_score}/100${p.website_mobile_friendly === 0 ? ", not mobile-friendly" : ""}`);
    if (p.website_exists && !p.online_booking_available && needsBooking(c.industry)) facts.push("No online booking on website");
    if (p.website_exists && !p.ecommerce_presence && c.industry === "Retail") facts.push("No e-commerce capability on website");
    facts.push(`Facebook page: ${p.facebook_page_exists ? "yes" : "no"}; LinkedIn page: ${p.linkedin_company_page_exists ? "yes" : "no"}; Google Business Profile: ${p.google_business_profile ? "yes" : "no"}`);
  }
  facts.push(`Opportunity Score ${score.score}/100 (${score.level}) from ${score.breakdown.length} scoring rule(s)`);
  return facts;
}

function needsBooking(industry: string) {
  return ["Beauty / Salon", "Healthcare / Clinic", "Hospitality", "Restaurant", "Education"].includes(industry);
}

/** Map signals + profile + industry to services a digital agency / IT company could sell. */
export function recommendServices(c: CompanyRow, p: DigitalProfile | undefined): string[] {
  const s: string[] = [];
  const noSite = p ? !p.website_exists : !c.website;
  const weakSite = p?.website_exists && p.website_quality_score != null && p.website_quality_score < 50;
  if (noSite) s.push("New corporate website");
  if (weakSite) s.push(p?.website_mobile_friendly === 0 ? "Mobile-first website redesign" : "Website redesign");
  if (p?.website_exists && !p.online_booking_available && needsBooking(c.industry)) s.push(c.industry === "Restaurant" ? "Online ordering & table booking" : "Online booking system");
  if (c.industry === "Retail" && !p?.ecommerce_presence) s.push("E-commerce website");
  if (c.new_branch_signal) s.push("Local SEO for new locations");
  if (c.new_branch_signal || noSite || (p && !p.google_business_profile)) s.push("Google Business Profile optimization");
  if (c.marketing_hiring_signal) s.push("Outsourced digital marketing");
  if (c.sales_hiring_signal) s.push("CRM implementation");
  if (c.sales_hiring_signal && c.expansion_signal) s.push("B2B lead generation campaigns");
  if (c.technology_hiring_signal) s.push("IT outsourcing / dedicated dev team");
  if (c.hiring_count >= 5) s.push("Recruitment software / HR system");
  if (c.expansion_signal && ["Manufacturing", "Logistics", "Construction"].includes(c.industry)) s.push("ERP / operations software");
  if (c.industry === "Manufacturing" && (noSite || weakSite)) s.push("Multilingual B2B export website");
  if (c.industry === "Real Estate") s.push("Project landing pages & lead ads");
  if (c.industry === "Education") s.push("Enrollment landing pages & CRM");
  if (c.digital_presence_signal === "WEAK") s.push("Social media management");
  if (c.digital_presence_signal === "STRONG") s.push("Performance marketing (Google / Facebook Ads)");
  if (s.length === 0) s.push("SEO audit", "Website maintenance & security");
  return [...new Set(s)].slice(0, 7);
}

/** Deterministic narrative generator (always available, fully reproducible). */
export function rulesAnalysis(c: CompanyRow, p: DigitalProfile | undefined, signals: SignalRow[], score: ScoreResult): Analysis {
  const n = name(c);
  const facts = buildFacts(c, p, signals, score);
  const services = recommendServices(c, p);
  const branch = latestOf(signals, "NEW_BRANCH");
  const exp = latestOf(signals, "EXPANSION");
  const launch = latestOf(signals, "PRODUCT_LAUNCH");
  const web = latestOf(signals, "WEBSITE_PROBLEM");
  const growth = latestOf(signals, "DIGITAL_GROWTH");

  const hiringRoles: string[] = [];
  if (c.sales_hiring_signal) hiringRoles.push("sales");
  if (c.marketing_hiring_signal) hiringRoles.push("marketing");
  if (c.technology_hiring_signal) hiringRoles.push("technology");

  // --- Summary ---
  const size = SIZE_WORD[c.estimated_employee_range ?? ""] ?? "";
  let summary = `${n} is a ${size ? size + " " : ""}${INDUSTRY_NOUN[c.industry] ?? c.industry.toLowerCase()} based in ${c.district ? c.district + ", " : ""}${c.province}.`;
  if (c.business_description) summary += ` ${c.business_description.replace(/\.?$/, ".")}`;
  if (c.new_branch_signal || c.expansion_signal) summary += ` Public signals indicate it is currently expanding its ${c.new_branch_signal ? "physical location network" : "operations"}.`;
  else if (c.hiring_signal) summary += ` It is currently recruiting${hiringRoles.length ? ` ${listJoin(hiringRoles)}` : ""} staff.`;

  // --- Why now (facts, then clearly hedged inference) ---
  const whyFacts: string[] = [];
  if (branch) whyFacts.push(`recently opened a new location (${fmtDate(branch.detected_at)}: "${branch.description}")`);
  if (exp) whyFacts.push(`announced expansion activity (${fmtDate(exp.detected_at)})`);
  if (launch) whyFacts.push(`launched a new product or service (${fmtDate(launch.detected_at)})`);
  if (hiringRoles.length) whyFacts.push(`is currently hiring ${listJoin(hiringRoles)} staff${c.hiring_count > 1 ? ` (${c.hiring_count} open positions in total)` : ""}`);
  else if (c.hiring_signal) whyFacts.push(`has ${c.hiring_count || "several"} open job position(s)`);
  if (growth) whyFacts.push(`is growing its digital channels (${growth.description.replace(/^Growing digital presence: /, "")})`);

  const gaps: string[] = [];
  if (p && !p.website_exists) gaps.push("it has no company website");
  else if (p?.website_quality_score != null && p.website_quality_score < 50)
    gaps.push(`its website scores only ${p.website_quality_score}/100${p.website_mobile_friendly === 0 ? " with weak mobile performance" : ""}`);
  else if (web) gaps.push(`website issues were detected (${web.description})`);
  if (p?.website_exists && !p.online_booking_available && needsBooking(c.industry)) gaps.push("it lacks online booking");
  if (p?.website_exists && !p.ecommerce_presence && c.industry === "Retail") gaps.push("it lacks e-commerce capability");
  if (c.digital_presence_signal === "WEAK") gaps.push("its social / local listings presence is weak");

  let why = "";
  if (whyFacts.length) {
    const growthWord = branch || exp ? "expanding" : hiringRoles.length ? "growing its team" : "active";
    why = `${n} appears to be ${growthWord}. The company ${listJoin(whyFacts)}.`;
  } else {
    why = `${n} shows limited recent business activity in public sources.`;
  }
  if (gaps.length) why += ` However, ${listJoin(gaps)}.`;
  if (score.level === "LOW") why += " Timing is not urgent — consider nurturing rather than immediate outreach.";

  // --- Inferences (always hedged) ---
  const inferences: string[] = [];
  if (branch || exp) inferences.push("The company may be investing in customer acquisition for new locations/markets, so it could be receptive to marketing and local-visibility services.");
  if (c.marketing_hiring_signal) inferences.push("Hiring marketing staff suggests an internal push on marketing; an agency could offer to accelerate results or fill skill gaps while the team ramps up.");
  if (c.sales_hiring_signal) inferences.push("A growing sales team may need better lead flow and a CRM to manage pipeline.");
  if (gaps.length && (whyFacts.length > 0)) inferences.push("The gap between business growth and digital maturity likely makes website or digital improvements a timely conversation.");
  if (c.technology_hiring_signal) inferences.push("Engineering hiring may indicate unmet software capacity that outsourcing could address.");
  if (inferences.length === 0) inferences.push(score.level === "LOW" ? "No strong buying trigger is visible; this account is better suited to long-term nurturing." : "Moderate activity suggests a possible need, but direct discovery is required to confirm it.");

  // --- Sales reasons (short bullet reasons, derived from score rules) ---
  const reasons = score.breakdown.filter((b) => !["FRESH_SIGNAL", "RECENT_SIGNAL"].includes(b.rule)).map((b) => b.label);

  // --- Pitch ---
  const [s1, s2] = services;
  let pitch: string;
  if (branch) pitch = `Approach ${n} around its expansion strategy. Mention the recently opened location and propose ${s1?.toLowerCase() ?? "a website upgrade"}${s2 ? ` combined with ${s2.toLowerCase()}` : ""} to support customer acquisition for the new site.`;
  else if (exp) pitch = `Open with ${n}'s recent expansion news. Position ${s1?.toLowerCase() ?? "digital services"} as a way to support the larger operation${s2 ? `, with ${s2.toLowerCase()} as a follow-on` : ""}.`;
  else if (c.marketing_hiring_signal) pitch = `Reference the open marketing role(s). Offer ${s1?.toLowerCase() ?? "outsourced digital marketing"} as a fast way to deliver results while the in-house team is being built${s2 ? `, plus ${s2.toLowerCase()}` : ""}.`;
  else if (c.sales_hiring_signal) pitch = `Reference the sales hiring. Propose ${s1?.toLowerCase() ?? "a CRM"}${s2 ? ` and ${s2.toLowerCase()}` : ""} so new sales staff have a steady flow of qualified leads.`;
  else if (p && !p.website_exists) pitch = `Lead with a quick audit showing how customers searching for ${c.industry.toLowerCase()} services in ${c.province} cannot find ${n} online, then propose ${s1?.toLowerCase() ?? "a new website"}.`;
  else if (gaps.length) pitch = `Share a short, free website/mobile audit highlighting concrete issues, then propose ${s1?.toLowerCase() ?? "a website redesign"}${s2 ? ` and ${s2.toLowerCase()}` : ""}.`;
  else pitch = `Low urgency. Add ${n} to a nurture sequence with educational content about ${s1?.toLowerCase() ?? "digital growth"} and revisit when a new signal appears.`;

  return { summary, why_now: why, facts, inferences, reasons, services, pitch, generated_by: "rules-engine" };
}

const LLM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "why_now", "inferences", "services", "pitch"],
  properties: {
    summary: { type: "string" },
    why_now: { type: "string" },
    inferences: { type: "array", items: { type: "string" } },
    services: { type: "array", items: { type: "string" } },
    pitch: { type: "string" },
  },
};

const LLM_SYSTEM = `You are a B2B sales intelligence analyst for the Vietnamese market, helping digital agencies and IT service companies prioritise SME prospects.
You receive VERIFIED FACTS about one company (from public business signals) and its deterministic Opportunity Score breakdown.
Rules:
- Use ONLY the facts provided. Never invent events, numbers, people, dates or contact details.
- The Opportunity Score is computed by rules; explain it, never change it.
- "summary": 1-2 sentences describing the company using only the facts.
- "why_now": 2-4 sentences. State facts plainly, then mark any interpretation with hedged language ("appears", "may", "likely").
- "inferences": 2-4 hedged interpretations (each must read as an inference, not a fact).
- "services": 3-7 concrete services a digital agency / IT company could sell, most relevant first.
- "pitch": a 2-3 sentence suggested sales approach referencing specific facts.
Write in clear professional English.`;

/** Claude-written narrative over the same deterministic facts. Falls back to rules on failure. */
export async function llmAnalysis(c: CompanyRow, p: DigitalProfile | undefined, signals: SignalRow[], score: ScoreResult): Promise<Analysis> {
  const base = rulesAnalysis(c, p, signals, score);
  const payload = {
    company: {
      name: c.company_name,
      brand: c.short_name,
      industry: c.industry,
      location: `${c.district ?? ""}, ${c.province}`,
      employees: c.estimated_employee_range,
      description: c.business_description,
      website: c.website,
    },
    verified_facts: base.facts,
    score: { value: score.score, level: score.level, rules_triggered: score.breakdown },
    candidate_services_from_rules: base.services,
  };
  const out = await callClaudeJSON<Omit<Analysis, "facts" | "reasons" | "generated_by">>(LLM_SYSTEM, JSON.stringify(payload, null, 2), LLM_SCHEMA);
  if (!out || !out.summary || !out.why_now) return base;
  return {
    ...base,
    summary: out.summary,
    why_now: out.why_now,
    inferences: out.inferences?.length ? out.inferences.slice(0, 5) : base.inferences,
    services: out.services?.length ? out.services.slice(0, 7) : base.services,
    pitch: out.pitch || base.pitch,
    generated_by: AI_MODEL,
  };
}

// ---------------------------------------------------------------------------------------------
// Persistence: recompute flags -> score -> analysis for a company
// ---------------------------------------------------------------------------------------------

export function loadCompanyBundle(db: Database.Database, id: number) {
  const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(id) as CompanyRow | undefined;
  if (!company) return null;
  const profile = db.prepare("SELECT * FROM company_digital_profiles WHERE company_id = ?").get(id) as DigitalProfile | undefined;
  const signals = db
    .prepare(
      `SELECT s.*, d.source_name FROM business_signals s LEFT JOIN data_sources d ON d.id = s.source_id
       WHERE s.company_id = ? ORDER BY s.detected_at DESC, s.id DESC`,
    )
    .all(id) as SignalRow[];
  return { company, profile, signals };
}

export function scoreCompany(db: Database.Database, id: number, now = new Date()): ScoreResult | null {
  const b = loadCompanyBundle(db, id);
  if (!b) return null;
  const result = computeOpportunityScore(
    {
      ...b.company,
      website_exists: b.profile ? b.profile.website_exists : b.company.website ? 1 : 0,
      website_quality_score: b.profile?.website_quality_score ?? null,
    },
    now,
  );
  return result;
}

function storeAnalysis(db: Database.Database, id: number, score: ScoreResult, a: Analysis) {
  db.prepare(
    `UPDATE companies SET ai_opportunity_score = @score, ai_opportunity_level = @level, ai_company_summary = @summary,
       ai_why_now = @why, ai_sales_reasons = @reasons, ai_recommended_services = @services, ai_recommended_sales_pitch = @pitch,
       ai_facts = @facts, ai_inferences = @inferences, ai_generated_by = @by, ai_generated_at = datetime('now')
     WHERE id = @id`,
  ).run({
    id,
    score: score.score,
    level: score.level,
    summary: a.summary,
    why: a.why_now,
    reasons: JSON.stringify(a.reasons),
    services: JSON.stringify(a.services),
    pitch: a.pitch,
    facts: JSON.stringify(a.facts),
    inferences: JSON.stringify(a.inferences),
    by: a.generated_by,
  });
  db.prepare("INSERT INTO opportunity_scores (company_id, score, level, raw_points, breakdown, model_version) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    score.score,
    score.level,
    score.raw_points,
    JSON.stringify(score.breakdown),
    SCORE_MODEL_VERSION,
  );
}

/** Synchronous full recompute with the deterministic engine (used by seed, import, admin, ingestion). */
export function recomputeCompany(db: Database.Database, id: number, now = new Date()): ScoreResult | null {
  refreshCompanySignalFlags(db, id, now);
  const b = loadCompanyBundle(db, id);
  if (!b) return null;
  const score = scoreCompany(db, id, now)!;
  storeAnalysis(db, id, score, rulesAnalysis(b.company, b.profile, b.signals, score));
  return score;
}

/** Async recompute that uses Claude for the narrative when available. */
export async function analyzeCompanyWithAI(db: Database.Database, id: number): Promise<{ score: ScoreResult; analysis: Analysis } | null> {
  refreshCompanySignalFlags(db, id);
  const b = loadCompanyBundle(db, id);
  if (!b) return null;
  const score = scoreCompany(db, id)!;
  const analysis = await llmAnalysis(b.company, b.profile, b.signals, score);
  storeAnalysis(db, id, score, analysis);
  return { score, analysis };
}

export function latestScoreBreakdown(db: Database.Database, id: number) {
  return db.prepare("SELECT * FROM opportunity_scores WHERE company_id = ? ORDER BY id DESC LIMIT 1").get(id) as
    | { score: number; level: string; raw_points: number; breakdown: string; model_version: string; calculated_at: string }
    | undefined;
}
