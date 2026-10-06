// Natural-language company search.
//   question -> SearchFilters (rules parser, or Claude structured output when configured)
//            -> real SQL query over the database -> grounded answer built ONLY from returned rows.
// The model never produces company records; it only produces filters, which are whitelisted.

import type Database from "better-sqlite3";
import { EMPLOYEE_RANGES, fold, INDUSTRIES, PROVINCES, PROVINCE_NAMES } from "./constants";
import { callClaudeJSON, llmEnabled, AI_MODEL } from "./llm";
import { searchCompanies, type HiringFilter, type SearchFilters, type SignalFilter, type SortKey, type WebsiteFilter } from "./search";
import type { CompanyListRow } from "./types";

export interface ParsedQuery {
  filters: SearchFilters;
  limit: number;
  interpretation: string[];
  parser: string;
}

const INDUSTRY_KEYWORDS: [RegExp, string][] = [
  [/\b(salons?|beauty|spas?|nails?|hair|barbers?|lash|tham my|toc)\b/, "Beauty / Salon"],
  [/\b(restaurants?|cafes?|coffee|f&b|food and beverage|nha hang|quan an|bakery|eatery)\b/, "Restaurant"],
  [/\b(retail(ers?)?|shops?|stores?|furniture|fashion|ban le|mini ?marts?|showrooms?)\b/, "Retail"],
  [/\b(manufactur\w*|factor(y|ies)|san xuat|plants?|garment|packaging|industrial)\b/, "Manufacturing"],
  [/\b(logistics?|transport\w*|freight|shipping|trucking|warehous\w*|van tai)\b/, "Logistics"],
  [/\b(real estate|propert(y|ies)|realty|bat dong san|developers? of)\b/, "Real Estate"],
  [/\b(education|schools?|english cent(er|re)s?|language cent(er|re)s?|academ(y|ies)|training|kindergartens?|edu)\b/, "Education"],
  [/\b(clinics?|healthcare|health care|dental|dentists?|hospitals?|medical|nha khoa|phong kham)\b/, "Healthcare / Clinic"],
  [/\b(tech(nology)? compan(y|ies)|software|it compan(y|ies)|saas|it services?)\b/, "Technology"],
  [/\b(construction|contractors?|xay dung|architects?|mep)\b/, "Construction"],
  [/\b(hotels?|hospitality|resorts?|homestays?|tourism|travel agenc(y|ies)|khach san)\b/, "Hospitality"],
  [/\b(professional services?|accounting|accountants?|law firms?|legal|consult\w*|audit\w*|hr agenc(y|ies)|recruitment agenc(y|ies))\b/, "Professional Services"],
];

const PROVINCE_KEYWORDS: [RegExp, string][] = [
  [/\b(ho chi minh( city)?|hcmc|hcm|tp\.? ?hcm|saigon|sai gon)\b/, "Ho Chi Minh City"],
  [/\b(ha ?noi)\b/, "Hanoi"],
  [/\b(da ?nang)\b/, "Da Nang"],
  [/\b(binh duong)\b/, "Binh Duong"],
  [/\b(dong nai|bien hoa)\b/, "Dong Nai"],
  [/\b(hai ?phong)\b/, "Hai Phong"],
  [/\b(can tho)\b/, "Can Tho"],
  [/\b(bac ninh)\b/, "Bac Ninh"],
];

const STOPWORDS = new Set(
  "find show list get give me i we the a an of in at on to for with and or that which who whose are is be been have has having companies company businesses business firms prospects leads best top good should contact today now please may might need needs new recently recent currently more than less over under employees staff people who what where when some any all their them it its this these those my our can could would like want looking search about from by into around near cong ty doanh nghiep tim o tai".split(
    " ",
  ),
);

function sizesAbove(n: number): string[] {
  const lower: Record<string, number> = { "1-10": 1, "11-50": 11, "51-200": 51, "201-500": 201, "500+": 501 };
  return EMPLOYEE_RANGES.filter((r) => lower[r] > n || (r !== "1-10" && lower[r] >= n && n > 1));
}
function sizesBelow(n: number): string[] {
  const upper: Record<string, number> = { "1-10": 10, "11-50": 50, "51-200": 200, "201-500": 500, "500+": Infinity };
  return EMPLOYEE_RANGES.filter((r) => upper[r] <= n);
}

/** Deterministic rule-based parser (always available). */
export function parseQueryRules(question: string): ParsedQuery {
  const orig = " " + fold(question).replace(/[?!.,;:()]/g, " ").replace(/\s+/g, " ") + " ";
  let t = orig; // working copy: recognised phrases are removed so leftovers can become keywords
  const f: SearchFilters = { sort: "score" };
  const notes: string[] = [];
  let limit = 25;
  const consume = (re: RegExp) => {
    t = t.replace(re, " ");
  };

  const lm = orig.match(/\b(?:top|best|show(?: me)?|first|list)\s+(\d{1,3})\b/) || orig.match(/\b(\d{1,3})\s+(?:best|top|companies|prospects|leads)\b/);
  if (lm) {
    limit = Math.min(100, Math.max(1, parseInt(lm[1], 10)));
    notes.push(`Limit: top ${limit}`);
    consume(new RegExp(`\\b${lm[1]}\\b`));
  }

  const industries = new Set<string>();
  for (const [re, ind] of INDUSTRY_KEYWORDS) {
    if (re.test(orig)) {
      industries.add(ind);
      consume(new RegExp(re.source, "g"));
    }
  }
  if (industries.size) {
    f.industry = [...industries];
    notes.push(`Industry = ${f.industry.join(" or ")}`);
  }

  for (const [re, prov] of PROVINCE_KEYWORDS) {
    if (re.test(orig)) {
      f.province = prov;
      notes.push(`Location = ${prov}`);
      consume(new RegExp(re.source, "g"));
      break;
    }
  }
  const districtPool = f.province ? PROVINCES[f.province].districts : PROVINCE_NAMES.flatMap((p) => PROVINCES[p].districts);
  for (const d of districtPool) {
    const dre = new RegExp(`\\b${fold(d)}\\b`);
    if (dre.test(orig) && !/^district$/.test(fold(d))) {
      f.district = d;
      if (!f.province) f.province = PROVINCE_NAMES.find((p) => PROVINCES[p].districts.includes(d));
      notes.push(`District = ${d}`);
      consume(dre);
      break;
    }
  }

  let m: RegExpMatchArray | null;
  if ((m = orig.match(/\b(?:more than|over|above|at least|>)\s*(\d{1,4})\s*(?:\+\s*)?(?:employees|staff|people|nhan vien)?/)) || (m = orig.match(/\b(\d{1,4})\s*\+\s*(?:employees|staff|people)/))) {
    const n = parseInt(m[1], 10);
    f.size = sizesAbove(n);
    notes.push(`Company size > ${n} employees (${f.size.join(", ")})`);
    consume(new RegExp(m[0].replace(/[+>]/g, "\\$&")));
  } else if ((m = orig.match(/\b(?:less than|fewer than|under|below|<)\s*(\d{1,4})\s*(?:employees|staff|people)?/))) {
    const n = parseInt(m[1], 10);
    f.size = sizesBelow(n);
    notes.push(`Company size < ${n} employees (${f.size.join(", ")})`);
    consume(new RegExp(m[0].replace(/[<]/g, "\\$&")));
  } else if (/\b(small|micro|sme|smes)\b/.test(orig)) {
    f.size = ["1-10", "11-50"];
    notes.push("Company size = small (1-50)");
    consume(/\b(small|micro|sme|smes)\b/g);
  } else if (/\b(large|big|enterprise)\b/.test(orig)) {
    f.size = ["201-500", "500+"];
    notes.push("Company size = large (200+)");
    consume(/\b(large|big|enterprise)\b/g);
  }

  // Website
  let website: WebsiteFilter | undefined;
  if (/\b(no|without|lack(ing)?|missing|khong co) (a )?(company )?website\b/.test(orig)) website = "none";
  else if (/\b(weak|poor|bad|outdated|old|slow|low[- ]quality|broken|ugly) (mobile )?websites?\b|\bwebsite (problems?|issues?)\b|\bneeds? (a )?(new |better )?website\b|\bnew website\b|\bwebsite (development|design|redesign|services?)\b|\bweb (development|design)\b/.test(orig))
    website = "needs";
  else if (/\b(has|have|with) (a )?website\b/.test(orig)) website = "has";
  if (website) {
    f.website = website;
    notes.push({ none: "Website = none", needs: "Website = none OR weak quality (< 50/100)", has: "Website = exists", low: "Website = low quality" }[website]);
    consume(/\b(website|websites|web)\b/g);
  }

  // Hiring
  const hiring = new Set<HiringFilter>();
  if (/\b(hiring|recruiting|tuyen|tuyen dung|job postings?|open positions?)\b[^.]{0,30}\b(sales|kinh doanh|business development)\b|\bsales (hiring|staff|reps?|team)\b/.test(orig)) hiring.add("sales");
  if (/\b(hiring|recruiting|tuyen)\b[^.]{0,30}\bmarketing\b|\bmarketing (hiring|staff|team|roles?)\b/.test(orig)) hiring.add("marketing");
  if (/\b(hiring|recruiting|tuyen)\b[^.]{0,30}\b(engineers?|developers?|it staff|programmers?|tech)\b|\b(engineers?|developers?) (hiring)\b/.test(orig)) hiring.add("tech");
  if (!hiring.size && /\b(hiring|recruiting|tuyen dung|job postings?|open positions?)\b/.test(orig)) hiring.add("any");
  if (hiring.size) {
    f.hiring = [...hiring];
    notes.push(`Hiring = ${f.hiring.map((h) => (h === "any" ? "any role" : h)).join(" + ")}`);
    consume(/\b(hiring|recruiting|currently|tuyen dung|tuyen|sales|marketing|engineers?|developers?)\b/g);
  }

  // Business signals
  const signals = new Set<SignalFilter>();
  if (/\b(new branch(es)?|opened (a |its )?(new )?(branch|store|showroom|location|clinic|campus)|new (store|showroom|location|clinic|campus)s?|opening|khai truong|chi nhanh)\b/.test(orig)) signals.add("new_branch");
  else if (/\b(expand(ed|ing)?|expansion|growing|growth|scaling|mo rong)\b/.test(orig) && !/digital growth|growing (online|digital)/.test(orig)) {
    f.growthAny = true;
    notes.push("Growth = new branch OR expansion detected");
  }
  if (/\b(news|press|announc\w*)\b/.test(orig)) signals.add("news");
  if (/\b(launch(ed|ing)?|new products?|ra mat)\b/.test(orig)) signals.add("product_launch");
  if (/\b(digital growth|growing (online|digital)|strong digital)\b/.test(orig)) signals.add("digital_growth");
  if (/\b(weak (digital|online|social)|no social|poor online presence)\b/.test(orig)) signals.add("weak_digital");
  if (signals.size) {
    f.signals = [...signals];
    notes.push(`Signals = ${f.signals.join(" + ")}`);
  }

  // Priority / timing
  if (/\b(contact|call|reach out|approach|email)\b.*\b(today|now|this week|first)\b|\bwho should i (contact|call)\b|\bwhich companies should\b/.test(orig)) {
    f.signalWithinDays = 30;
    f.minScore = 50;
    if (!lm) limit = 10;
    notes.push("Timing = signal in the last 30 days, score ≥ 50 (ready to contact)");
  }
  if (/\b(high (opportunity|priority|score|potential)|hot (leads?|prospects?)|highest)\b/.test(orig)) {
    f.level = ["HIGH"];
    notes.push("Opportunity = HIGH");
  }
  if (/\b(latest|most recent|newest) (signals?|activity)\b/.test(orig)) {
    f.sort = "signal";
    notes.push("Sort = most recent signal");
  } else if (/\b(largest|biggest)\b/.test(orig)) {
    f.sort = "size";
    notes.push("Sort = company size");
  }

  // Industry sub-types become an extra keyword so "dental clinics" doesn't return eye clinics
  const sub = orig.match(/\b(furniture|dental|coffee|nail|hair|spa|garment|packaging|plastic|ielts|kindergarten|hotel|resort|homestay|accounting|law|cold[- ]chain|seafood|hotpot|fashion|electronics|cosmetics|software|kids)\b/);
  if (sub && !f.q) {
    f.q = sub[1];
    notes.push(`Keyword = "${f.q}"`);
  }

  // Leftover meaningful words become a keyword search (relaxed automatically if nothing matches)
  const leftover = t
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .filter((w) => !/^(opportunit|signal|score|prior|expan|grow|branch|website|hiring|recruit|launch|news|digital|online|presence|weak|strong|employee|staff|sell|selling|services?|development|days?|week|month|high|low|medium|ready|potential|open|store|shop|showroom|location|clinic|campus|outlet|salon|compan|firm|poor|bad|outdated|old|slow|quality|team|role|position|job|today|call|reach|approach|email|small|large|big|largest|latest|newest)/.test(w));
  if (leftover.length && !f.q) {
    f.q = leftover.slice(0, 4).join(" ");
    notes.push(`Keyword = "${f.q}"`);
  }
  if (!notes.length) notes.push("No specific filters recognised — showing the highest-scoring opportunities");
  notes.push(`Sort = ${f.sort === "score" ? "Opportunity Score (desc)" : f.sort}`);
  return { filters: f, limit, interpretation: notes, parser: "rules" };
}

// ---------- Claude-powered parser (optional) ----------

const FILTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["industry", "province", "district", "size", "website", "hiring", "signals", "growth_any", "level", "signal_within_days", "min_score", "keyword", "sort", "limit", "interpretation"],
  properties: {
    industry: { type: "array", items: { type: "string", enum: [...INDUSTRIES] } },
    province: { type: ["string", "null"], enum: [...PROVINCE_NAMES, null] },
    district: { type: ["string", "null"] },
    size: { type: "array", items: { type: "string", enum: [...EMPLOYEE_RANGES] } },
    website: { type: ["string", "null"], enum: ["has", "none", "low", "needs", null] },
    hiring: { type: "array", items: { type: "string", enum: ["any", "sales", "marketing", "tech"] } },
    signals: { type: "array", items: { type: "string", enum: ["new_branch", "expansion", "news", "digital_growth", "weak_digital", "product_launch"] } },
    growth_any: { type: "boolean" },
    level: { type: "array", items: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] } },
    signal_within_days: { type: ["integer", "null"] },
    min_score: { type: ["integer", "null"] },
    keyword: { type: ["string", "null"] },
    sort: { type: "string", enum: ["score", "signal", "size", "updated"] },
    limit: { type: "integer" },
    interpretation: { type: "array", items: { type: "string" } },
  },
};

const PARSER_SYSTEM = `You translate a salesperson's natural-language request into database filters for a Vietnamese B2B company database.
Only output filters; never output company names or data. Use empty arrays / null when a filter is not requested.
Field meanings:
- website: "none" = no website, "low" = website quality < 50, "needs" = none OR low (use for "need a new website", "weak website", selling web development), "has" = has a website.
- hiring: "any" currently hiring, "sales", "marketing", "tech" (engineers/developers).
- signals (all must match): new_branch, expansion, news, digital_growth, weak_digital, product_launch.
- growth_any: true when the user asks for companies that are expanding/growing in general (new branch OR expansion).
- size: employee ranges; "more than 50 employees" = ["51-200","201-500","500+"].
- "contact today"/"who should I call" => signal_within_days 30, min_score 50, sort "score", limit 10.
- keyword: only for specific terms not covered by other fields (e.g. "furniture", "dental", "IELTS"), else null.
- limit: number of results requested (default 25, max 100).
- interpretation: short human-readable bullet list of the filters you applied.`;

interface LlmFilters {
  industry: string[];
  province: string | null;
  district: string | null;
  size: string[];
  website: WebsiteFilter | null;
  hiring: HiringFilter[];
  signals: SignalFilter[];
  growth_any: boolean;
  level: string[];
  signal_within_days: number | null;
  min_score: number | null;
  keyword: string | null;
  sort: SortKey;
  limit: number;
  interpretation: string[];
}

export async function parseQueryLLM(question: string): Promise<ParsedQuery | null> {
  const out = await callClaudeJSON<LlmFilters>(PARSER_SYSTEM, question, FILTER_SCHEMA);
  if (!out) return null;
  // Whitelist every value again server-side.
  const f: SearchFilters = {
    industry: (out.industry ?? []).filter((i) => (INDUSTRIES as readonly string[]).includes(i)),
    province: out.province && PROVINCE_NAMES.includes(out.province) ? out.province : undefined,
    size: (out.size ?? []).filter((s) => (EMPLOYEE_RANGES as readonly string[]).includes(s)),
    website: (["has", "none", "low", "needs"] as const).find((w) => w === out.website),
    hiring: (out.hiring ?? []).filter((h) => ["any", "sales", "marketing", "tech"].includes(h)),
    signals: (out.signals ?? []).filter((s) => ["new_branch", "expansion", "news", "digital_growth", "weak_digital", "product_launch"].includes(s)),
    growthAny: out.growth_any || undefined,
    level: (out.level ?? []).filter((l) => ["HIGH", "MEDIUM", "LOW"].includes(l)),
    signalWithinDays: out.signal_within_days && out.signal_within_days > 0 ? Math.min(365, out.signal_within_days) : undefined,
    minScore: out.min_score != null ? Math.max(0, Math.min(100, out.min_score)) : undefined,
    q: out.keyword?.slice(0, 100) || undefined,
    sort: (["score", "signal", "size", "updated"] as const).find((s) => s === out.sort) ?? "score",
  };
  if (out.district && f.province && PROVINCES[f.province].districts.includes(out.district)) f.district = out.district;
  return { filters: f, limit: Math.min(100, Math.max(1, out.limit || 25)), interpretation: out.interpretation?.slice(0, 10) ?? [], parser: AI_MODEL };
}

// ---------- execution with progressive relaxation ----------

export interface NLSearchResult {
  question: string;
  parsed: ParsedQuery;
  rows: CompanyListRow[];
  total: number;
  relaxed: string[];
  answer: string;
}

export async function runNLSearch(db: Database.Database, question: string): Promise<NLSearchResult> {
  const parsed = (llmEnabled() ? await parseQueryLLM(question) : null) ?? parseQueryRules(question);
  const f: SearchFilters = { ...parsed.filters, pageSize: parsed.limit, page: 1 };
  const relaxed: string[] = [];
  let res = searchCompanies(db, f);
  // Relax the least important constraints first if nothing matches.
  const steps: [string, () => boolean][] = [
    ["keyword", () => (f.q ? (delete f.q, true) : false)],
    ["district", () => (f.district ? (delete f.district, true) : false)],
    ["timing / minimum score", () => (f.signalWithinDays || f.minScore ? (delete f.signalWithinDays, delete f.minScore, true) : false)],
    ["business signals", () => (f.signals?.length || f.growthAny ? (delete f.signals, delete f.growthAny, true) : false)],
  ];
  for (const [label, apply] of steps) {
    if (res.total > 0) break;
    if (apply()) {
      relaxed.push(label);
      res = searchCompanies(db, f);
    }
  }
  return { question, parsed: { ...parsed, filters: f }, rows: res.rows, total: res.total, relaxed, answer: groundedAnswer(res.rows, res.total, relaxed) };
}

/** Answer text built strictly from returned records (no hallucination possible). */
function groundedAnswer(rows: CompanyListRow[], total: number, relaxed: string[]): string {
  if (!rows.length) return "No companies in the database match this request. Try removing a filter (e.g. location or signal).";
  const top = rows.slice(0, 3).map((r) => `${r.short_name || r.company_name} (${r.ai_opportunity_score})`);
  let s = `Found ${total} matching compan${total === 1 ? "y" : "ies"} in the database${rows.length < total ? `, showing the top ${rows.length}` : ""}. Best matches: ${top.join(", ")}.`;
  const first = rows[0];
  if (first.ai_why_now) s += ` Why ${first.short_name || first.company_name}: ${first.ai_why_now.split(". ").slice(0, 2).join(". ").replace(/\.?$/, ".")}`;
  if (relaxed.length) s += ` (No exact match — relaxed: ${relaxed.join(", ")}.)`;
  return s;
}
