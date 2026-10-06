import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { detectSignals, extractQuantity } from "../src/lib/signals";
import { computeOpportunityScore } from "../src/lib/scoring";
import { parseQueryRules } from "../src/lib/nlsearch";
import { normalizeEmployeeRange, normalizeProvince, normalizeWebsite, normalizeIndustry } from "../src/lib/companies";
import { importCompaniesCSV, parseCSV } from "../src/lib/importer";
import { SCHEMA_SQL } from "../src/lib/schema";
import { seedDatabase } from "../src/lib/seed";
import { searchCompanies } from "../src/lib/search";

test("job posting: 'recruiting 10 sales staff' -> SALES_HIRING HIGH", () => {
  const { signals } = detectSignals({ observation_type: "JOB_POSTING", raw_text: "ABC Company recruiting 10 sales staff" });
  const s = signals.find((x) => x.signal_type === "SALES_HIRING");
  assert.equal(s?.signal_strength, "HIGH");
  assert.equal(s?.quantity, 10);
  assert.ok(signals.some((x) => x.signal_type === "HIRING"));
});

test("Vietnamese job posting is understood", () => {
  const { signals } = detectSignals({ observation_type: "JOB_POSTING", raw_text: "Tuyển 2 Nhân viên Marketing Online" });
  assert.ok(signals.some((x) => x.signal_type === "MARKETING_HIRING" && x.signal_strength === "HIGH"));
  assert.equal(extractQuantity("Tuyển 6 kỹ thuật viên spa"), 6);
});

test("news: 'opens its third branch in Da Nang' -> NEW_BRANCH HIGH", () => {
  const { signals } = detectSignals({ observation_type: "NEWS", raw_text: "ABC opens its third branch in Da Nang" });
  assert.equal(signals.find((x) => x.signal_type === "NEW_BRANCH")?.signal_strength, "HIGH");
  assert.ok(signals.some((x) => x.signal_type === "RECENT_NEWS"));
});

test("website scan parsing -> WEBSITE_PROBLEM + profile patch", () => {
  const { signals, profile } = detectSignals({ observation_type: "WEBSITE_SCAN", raw_text: "Website scan: status=200; quality_score=30; mobile_friendly=no; https=no; last_updated=2018" });
  assert.equal(signals[0].signal_type, "WEBSITE_PROBLEM");
  assert.equal(signals[0].signal_strength, "HIGH");
  assert.equal(profile.website_quality_score, 30);
  assert.equal(profile.website_mobile_friendly, 0);
  const none = detectSignals({ observation_type: "WEBSITE_SCAN", raw_text: "no website found; status=none" });
  assert.equal(none.signals[0].signal_type, "NO_WEBSITE");
  assert.equal(none.profile.website_exists, 0);
});

test("opportunity score is deterministic, normalized and capped", () => {
  const base = { hiring_count: 0, marketing_hiring_signal: 0, sales_hiring_signal: 0, new_branch_signal: 0, expansion_signal: 0, recent_news_signal: 0, digital_presence_signal: "NEUTRAL", latest_signal_date: null, website_exists: 1, website_quality_score: 80 };
  assert.equal(computeOpportunityScore(base).score, 0);
  const hot = { ...base, website_exists: 0, new_branch_signal: 1, sales_hiring_signal: 1, marketing_hiring_signal: 1, expansion_signal: 1, hiring_count: 9, recent_news_signal: 1, digital_presence_signal: "WEAK", latest_signal_date: new Date().toISOString() };
  const r = computeOpportunityScore(hot);
  assert.equal(r.score, 100);
  assert.equal(r.level, "HIGH");
  const mid = computeOpportunityScore({ ...base, new_branch_signal: 1, marketing_hiring_signal: 1, website_quality_score: 40 });
  assert.equal(mid.raw_points, 45);
  assert.equal(mid.score, Math.round((45 * 100) / 95));
  assert.equal(mid.level, "MEDIUM");
});

test("NL parser: salon scenario", () => {
  const p = parseQueryRules("Find salons in Ho Chi Minh City that may need a new website.");
  assert.deepEqual(p.filters.industry, ["Beauty / Salon"]);
  assert.equal(p.filters.province, "Ho Chi Minh City");
  assert.equal(p.filters.website, "needs");
});

test("NL parser: size, hiring, limit", () => {
  const p = parseQueryRules("Find manufacturing companies in Binh Duong with more than 50 employees that are currently hiring.");
  assert.deepEqual(p.filters.size, ["51-200", "201-500", "500+"]);
  assert.deepEqual(p.filters.hiring, ["any"]);
  assert.equal(parseQueryRules("Show the 20 best prospects for selling website development services.").limit, 20);
});

test("normalisation helpers", () => {
  assert.equal(normalizeProvince("TP.HCM"), "Ho Chi Minh City");
  assert.equal(normalizeProvince("Hà Nội"), "Hanoi");
  assert.equal(normalizeEmployeeRange("120-180"), "51-200");
  assert.equal(normalizeEmployeeRange("8"), "1-10");
  assert.equal(normalizeWebsite("Example.VN/"), "https://example.vn");
  assert.equal(normalizeIndustry("Dental clinic"), "Healthcare / Clinic");
});

test("CSV parser handles quotes", () => {
  assert.deepEqual(parseCSV('a,b\n"x, y","he said ""hi"""\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
});

test("seed + search + CSV import end to end (in-memory)", () => {
  const db = new Database(":memory:");
  db.exec(SCHEMA_SQL);
  seedDatabase(db, { generated: 120 });
  const all = searchCompanies(db, {});
  assert.equal(all.total, 120);
  const salons = searchCompanies(db, { industry: ["Beauty / Salon"], province: "Ho Chi Minh City", website: "needs" });
  assert.equal(salons.rows[0].short_name, "Beauty House");
  const csv = "company_name,tax_code,industry,province,address,website,employee_range\nCông ty A,0101010101,Retail,HCM,addr,a-demo.vn,30\nCông ty A,0101010101,Retail,HCM,addr,a-demo.vn,30\n,,Retail,Hanoi,,,\n";
  const rep = importCompaniesCSV(db, csv);
  assert.equal(rep.inserted.length, 1);
  assert.equal(rep.duplicates.length, 1);
  assert.equal(rep.invalid.length, 1);
  assert.equal(searchCompanies(db, {}).total, 121);
});
