// Deterministic, auditable Opportunity Score (0-100).
// AI never sets the score - it only explains it. Every point is traceable to a rule below.

import type { OpportunityLevel } from "./constants";

export const SCORE_MODEL_VERSION = "rules-v1";

export interface ScoreInput {
  hiring_count: number;
  marketing_hiring_signal: number;
  sales_hiring_signal: number;
  new_branch_signal: number;
  expansion_signal: number;
  recent_news_signal: number;
  digital_presence_signal: string;
  latest_signal_date: string | null;
  website_exists: number | null;
  website_quality_score: number | null;
}

export interface ScoreRuleHit {
  rule: string;
  label: string;
  points: number;
}

export interface ScoreResult {
  score: number;
  level: OpportunityLevel;
  raw_points: number;
  breakdown: ScoreRuleHit[];
}

/** Documented rule table (shown in the UI and README). */
export const SCORE_RULES = [
  { rule: "NO_WEBSITE", points: 20, label: "No website" },
  { rule: "POOR_WEBSITE", points: 15, label: "Poor website quality (< 35/100)" },
  { rule: "WEAK_WEBSITE", points: 10, label: "Below-average website quality (35-49/100)" },
  { rule: "NEW_BRANCH", points: 20, label: "New branch / location opened" },
  { rule: "SALES_HIRING", points: 15, label: "Hiring sales staff" },
  { rule: "MARKETING_HIRING", points: 15, label: "Hiring marketing staff" },
  { rule: "EXPANSION", points: 10, label: "Recent expansion" },
  { rule: "STRONG_RECRUITMENT", points: 10, label: "Strong recruitment activity (5+ open positions)" },
  { rule: "MODERATE_RECRUITMENT", points: 5, label: "Moderate recruitment activity (3-4 open positions)" },
  { rule: "RECENT_NEWS", points: 5, label: "Recent company news" },
  { rule: "WEAK_DIGITAL", points: 5, label: "Weak digital presence" },
  { rule: "FRESH_SIGNAL", points: 5, label: "Signal detected in the last 14 days" },
  { rule: "RECENT_SIGNAL", points: 3, label: "Signal detected in the last 15-30 days" },
] as const;

/** Raw points are normalised so that a typical "perfect" prospect (95 raw points) maps to 100. */
export const NORMALIZER = 95;

const pts = (rule: string) => SCORE_RULES.find((r) => r.rule === rule)!;

export function levelFor(score: number): OpportunityLevel {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

export function computeOpportunityScore(c: ScoreInput, now = new Date()): ScoreResult {
  const hits: ScoreRuleHit[] = [];
  const add = (rule: string, label?: string) => {
    const r = pts(rule);
    hits.push({ rule, label: label ?? r.label, points: r.points });
  };

  if (c.website_exists === 0) add("NO_WEBSITE");
  else if (c.website_quality_score != null && c.website_quality_score < 35) add("POOR_WEBSITE", `Poor website quality (${c.website_quality_score}/100)`);
  else if (c.website_quality_score != null && c.website_quality_score < 50) add("WEAK_WEBSITE", `Below-average website quality (${c.website_quality_score}/100)`);

  if (c.new_branch_signal) add("NEW_BRANCH");
  if (c.sales_hiring_signal) add("SALES_HIRING");
  if (c.marketing_hiring_signal) add("MARKETING_HIRING");
  if (c.expansion_signal) add("EXPANSION");
  if (c.hiring_count >= 5) add("STRONG_RECRUITMENT", `Strong recruitment activity (${c.hiring_count} open positions)`);
  else if (c.hiring_count >= 3) add("MODERATE_RECRUITMENT", `Moderate recruitment activity (${c.hiring_count} open positions)`);
  if (c.recent_news_signal) add("RECENT_NEWS");
  if (c.digital_presence_signal === "WEAK") add("WEAK_DIGITAL");

  if (c.latest_signal_date) {
    const days = (now.getTime() - new Date(c.latest_signal_date).getTime()) / 86400000;
    if (days <= 14) add("FRESH_SIGNAL");
    else if (days <= 30) add("RECENT_SIGNAL");
  }

  const raw = hits.reduce((a, h) => a + h.points, 0);
  const score = Math.min(100, Math.round((raw * 100) / NORMALIZER));
  return { score, level: levelFor(score), raw_points: raw, breakdown: hits };
}
