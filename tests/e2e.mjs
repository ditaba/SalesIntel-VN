// End-to-end smoke test of all major flows against a running server.
//   BASE_URL=http://localhost:3000 node tests/e2e.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR || "";
const exe = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";

const results = [];
const consoleErrors = [];
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    results.push(`✅ ${name}`);
  } catch (e) {
    failed++;
    results.push(`❌ ${name}: ${e.message.split("\n")[0]}`);
  }
}
function assert(c, msg) {
  if (!c) throw new Error(msg);
}

const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${page.url()} :: ${m.text()}`));
page.on("pageerror", (e) => consoleErrors.push(`${page.url()} :: pageerror ${e.message}`));
const shot = async (n) => SHOTS && (await page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true }));

const email = `e2e+${Date.now()}@test.vn`;

await step("Unauthenticated users are redirected to /login", async () => {
  await page.goto(`${BASE}/companies`);
  assert(page.url().includes("/login"), `url=${page.url()}`);
});

await step("Register a new account", async () => {
  await page.goto(`${BASE}/register`);
  await page.fill("#name", "E2E Tester");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/`);
  await page.getByText("Good day, E2E").waitFor();
});

await step("Logout", async () => {
  await page.click("button[aria-label='Log out']");
  await page.waitForURL(/\/login/);
});

await step("Login with wrong password shows error", async () => {
  await page.fill("#email", email);
  await page.fill("#password", "nope-nope");
  await page.click("button[type=submit]");
  await page.getByRole("alert").waitFor();
});

await step("Login with the new account", async () => {
  await page.fill("#password", "password123");
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/`);
});

await step("Forgot / reset password flow", async () => {
  const p2 = await ctx.newPage();
  await p2.context().clearCookies();
  await p2.goto(`${BASE}/forgot-password`);
  await p2.fill("input[type=email]", email);
  await p2.click("button");
  await p2.getByText("Open reset link").click();
  await p2.waitForURL(/reset-password/);
  await p2.fill("input[type=password]", "newpassword123");
  await p2.click("button");
  await p2.getByText("Password updated").waitFor();
  await p2.close();
  // session cookie was cleared for the context; log in with the new password
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", "newpassword123");
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/`);
});

await step("Demo login (one click) + dashboard cards & charts", async () => {
  await ctx.clearCookies();
  await page.goto(`${BASE}/login`);
  await page.click("[data-testid=demo-user]");
  await page.waitForURL(`${BASE}/`);
  for (const t of ["Total companies", "High opportunity", "New signals this week", "Saved leads", "Top opportunities", "Latest business signals", "Top industries", "Top locations"])
    await page.getByText(t, { exact: true }).first().waitFor();
  await page.waitForSelector(".recharts-bar-rectangle");
  await shot("01-dashboard");
});

let baseline = 0;
await step("Company search: list + result count", async () => {
  await page.goto(`${BASE}/companies`);
  const txt = await page.getByTestId("result-count").innerText();
  baseline = parseInt(txt.replace(/,/g, ""), 10);
  assert(baseline >= 300, `expected >=300 companies, got ${txt}`);
  assert((await page.getByTestId("company-row").count()) === 25, "expected 25 rows on page 1");
  await shot("02-companies");
});

const count = async () => parseInt((await page.getByTestId("result-count").innerText()).replace(/,/g, ""), 10);

await step("Filters: province + industry + website narrow results", async () => {
  await page.selectOption("[data-testid=filter-province]", "Ho Chi Minh City");
  await page.waitForURL(/province=/);
  const a = await count();
  assert(a < baseline && a > 0, `province filter: ${a}`);
  await page.getByTestId("industry-Beauty / Salon").check();
  await page.waitForURL(/industry=/);
  const b = await count();
  assert(b < a && b > 0, `industry filter: ${b}`);
  await page.getByTestId("website-needs").check();
  await page.waitForURL(/website=needs/);
  const c = await count();
  assert(c <= b && c > 0, `website filter: ${c}`);
  const first = await page.getByTestId("company-link").first().innerText();
  assert(first === "Beauty House", `expected Beauty House first, got ${first}`);
  await shot("03-filtered");
});

await step("Filters: hiring, signals, level, keyword, district", async () => {
  await page.goto(`${BASE}/companies?hiring=sales`);
  const s = await count();
  await page.goto(`${BASE}/companies?hiring=sales,marketing`);
  assert((await count()) <= s, "hiring AND");
  await page.goto(`${BASE}/companies?signals=new_branch`);
  assert((await count()) > 0, "new_branch");
  await page.goto(`${BASE}/companies?level=HIGH`);
  const h = await count();
  assert(h > 0 && h < baseline, `level HIGH ${h}`);
  await page.goto(`${BASE}/companies?q=furniture`);
  assert((await count()) > 0, "keyword furniture");
  await page.goto(`${BASE}/companies?q=ha%20noi`);
  assert((await count()) > 0, "diacritic-insensitive keyword");
  await page.goto(`${BASE}/companies?province=Hanoi&district=Cau%20Giay`);
  assert((await count()) > 0, "district");
  await page.goto(`${BASE}/companies?size=500%2B`);
  assert((await count()) > 0, "size 500+");
});

await step("Sorting changes order", async () => {
  await page.goto(`${BASE}/companies`);
  const byScore = await page.getByTestId("company-link").first().innerText();
  await page.selectOption("[data-testid=sort-select]", "name");
  await page.waitForURL(/sort=name/);
  const byName = await page.getByTestId("company-link").first().innerText();
  await page.selectOption("[data-testid=sort-select]", "signal");
  await page.waitForURL(/sort=signal/);
  await page.selectOption("[data-testid=sort-select]", "size");
  await page.waitForURL(/sort=size/);
  await page.selectOption("[data-testid=sort-select]", "updated");
  await page.waitForURL(/sort=updated/);
  assert(byScore !== byName, "sort by name should change order");
});

await step("Pagination", async () => {
  await page.goto(`${BASE}/companies`);
  await page.getByTestId("next-page").click();
  await page.waitForURL(/page=2/);
  assert((await page.getByTestId("company-row").count()) > 0, "page 2 rows");
});

let beautyId = "";
await step("Company detail: WHY NOW, facts vs inference, signals timeline, services, pitch, sources", async () => {
  await page.goto(`${BASE}/companies?q=beauty%20house`);
  await page.getByTestId("company-link").first().click();
  await page.waitForURL(/\/companies\/\d+/);
  beautyId = page.url().split("/").pop();
  assert((await page.getByTestId("company-name").innerText()).includes("Beauty House"), "name");
  const why = await page.getByTestId("why-now").innerText();
  assert(/third|branch|location/i.test(why) && /marketing/i.test(why) && /mobile|website/i.test(why), `why now: ${why}`);
  assert((await page.locator("[data-testid=facts] li").count()) >= 4, "facts");
  assert((await page.locator("[data-testid=inferences] li").count()) >= 1, "inferences");
  assert((await page.locator("[data-testid=signal-timeline] li").count()) >= 4, "timeline");
  const services = await page.getByTestId("services").innerText();
  assert(/booking/i.test(services) && /SEO/i.test(services) && /website/i.test(services), `services: ${services}`);
  assert((await page.getByTestId("pitch").innerText()).length > 40, "pitch");
  assert((await page.locator("[data-testid=sources] a").count()) >= 2, "sources");
  assert((await page.locator("[data-testid=score-breakdown] tr").count()) >= 4, "breakdown");
  await shot("04-company-detail");
});

await step("AI explanation: regenerate analysis", async () => {
  await page.getByTestId("analyze-btn").click();
  await page.getByText(/Updated by/).waitFor({ timeout: 60000 });
});

await step("AI Search: salon scenario returns Beauty House > Hair Studio ABC > Luxury Salon XYZ", async () => {
  await page.goto(`${BASE}/ai-search`);
  await page.fill("[data-testid=ai-input]", "Find salons in Ho Chi Minh City that may need a new website.");
  await page.keyboard.press("Enter");
  await page.getByTestId("ai-results").waitFor({ timeout: 60000 });
  const names = await page.getByTestId("ai-result-link").allInnerTexts();
  assert(names[0] === "Beauty House" && names[1] === "Hair Studio ABC" && names[2] === "Luxury Salon XYZ", `got ${names.slice(0, 3)}`);
  const filters = await page.getByTestId("ai-filters").innerText();
  assert(/Beauty/.test(filters) && /Ho Chi Minh/.test(filters) && /Website/.test(filters), `filters: ${filters}`);
  await shot("05-ai-search");
});

await step("AI Search: other example queries return real records", async () => {
  for (const q of ["Find manufacturing companies in Binh Duong with more than 50 employees that are currently hiring.", "Show the 20 best prospects for selling website development services.", "Which companies should I contact today?"]) {
    await page.fill("[data-testid=ai-input]", q);
    await page.keyboard.press("Enter");
    await page.waitForFunction((n) => document.querySelectorAll("[data-testid=ai-answer]").length >= n, (await page.getByTestId("ai-answer").count()) + 1, { timeout: 60000 });
  }
  const last = await page.getByTestId("ai-answer").last().innerText();
  assert(/Found \d+/.test(last), last);
});

await step("Save lead to an existing list + create new list from the save menu", async () => {
  await page.goto(`${BASE}/companies/${beautyId}`);
  await page.getByTestId(`save-${beautyId}`).click();
  await page.getByTestId("new-list-name").fill("E2E prospects");
  await page.getByTestId("new-list-name").press("Enter");
  await page.getByTestId("list-toggle-E2E prospects").waitFor();
  await page.goto(`${BASE}/leads`);
  await page.getByText("E2E prospects").click();
  await page.waitForURL(/list=/);
  assert((await page.getByTestId("active-list-name").innerText()) === "E2E prospects", "active list");
  assert((await page.locator("[data-testid=list-companies] li").count()) === 1, "1 saved company");
  await shot("06-leads");
});

await step("Remove saved company + create/delete list", async () => {
  await page.getByTestId(`remove-${beautyId}`).click();
  await page.getByText("This list is empty").waitFor();
  await page.getByTestId("create-list-input").fill("High priority October 2");
  await page.getByTestId("create-list-btn").click();
  await page.waitForURL(/list=/);
  await page.getByTestId("active-list-name").filter({ hasText: "High priority October 2" }).waitFor();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("delete-list").click();
  await page.waitForURL(`${BASE}/leads`);
});

await step("Signals feed with filters", async () => {
  await page.goto(`${BASE}/signals?type=NEW_BRANCH&days=90`);
  await page.getByText(/\d+ signals/).waitFor();
  assert((await page.locator("tbody tr").count()) > 0, "signals rows");
});

await step("Non-admin cannot open admin", async () => {
  await page.goto(`${BASE}/admin`);
  assert(!page.url().includes("/admin"), page.url());
});

await step("Admin login", async () => {
  await ctx.clearCookies();
  await page.goto(`${BASE}/login`);
  await page.click("[data-testid=demo-admin]");
  await page.waitForURL(`${BASE}/`);
  await page.goto(`${BASE}/admin`);
  await page.getByText("Opportunity score rules (rules-v1)").waitFor();
  await shot("07-admin");
});

let newId = "";
await step("Admin CRUD: create company", async () => {
  await page.goto(`${BASE}/admin/companies/new`);
  await page.fill("input[name=company_name]", "Công ty TNHH E2E Test Salon");
  await page.fill("input[name=short_name]", "E2E Test Salon");
  await page.selectOption("select[name=industry]", "Beauty / Salon");
  await page.selectOption("select[name=province]", "Da Nang");
  await page.fill("input[name=district]", "Hai Chau");
  await page.fill("input[name=address]", "1 Bạch Đằng");
  await page.getByTestId("company-save").click();
  await page.waitForURL(/\/admin\/companies\/\d+\?created=1/);
  newId = page.url().match(/companies\/(\d+)/)[1];
});

await step("Admin CRUD: edit company", async () => {
  await page.fill("input[name=website]", "e2e-test-salon.vn");
  await page.getByTestId("company-save").click();
  await page.getByText(/Saved\. Opportunity score recalculated/).waitFor();
});

await step("Signal engine: ingest raw observation -> signals -> score", async () => {
  await page.getByTestId("observation-text").fill("E2E Test Salon khai trương chi nhánh thứ ba tại Sơn Trà");
  await page.locator("[data-testid=observation-form] select").first().selectOption("NEWS");
  await page.getByTestId("observation-text").fill("E2E Test Salon khai trương chi nhánh thứ ba tại Sơn Trà");
  await page.getByTestId("observation-submit").click();
  await page.getByText(/processed → \d+ signal/).waitFor();
  await page.locator("[data-testid=observation-form]").getByText("New Branch").first().waitFor();
});

await step("Admin: create signal manually", async () => {
  await page.getByTestId("signal-type").first().selectOption("SALES_HIRING");
  await page.getByTestId("signal-description").fill("Hiring 3 sales reps (manual)");
  await page.getByTestId("signal-create").click();
  await page.getByText(/Signal created\. Score recalculated/).waitFor();
});

await step("Admin: trigger AI analysis for a company", async () => {
  await page.getByTestId("admin-analyze").click();
  await page.getByText(/narrative by/).waitFor({ timeout: 60000 });
});

await step("Admin: recalculate all scores", async () => {
  await page.goto(`${BASE}/admin`);
  await page.getByTestId("recalc-all").click();
  await page.getByTestId("recalc-msg").waitFor({ timeout: 60000 });
});

await step("Admin: data sources page + activation guard", async () => {
  await page.goto(`${BASE}/admin/sources`);
  await page.getByTestId("sources-table").waitFor();
  const row = page.locator("tr", { hasText: "National Business Registration Portal" });
  await row.getByRole("button", { name: "Disabled" }).click();
  await page.getByText(/Cannot activate a source before legal review/).waitFor();
  await shot("08-sources");
});

await step("CSV import: dry run + import (validate, dedupe, normalise, insert, score)", async () => {
  await page.goto(`${BASE}/admin/import`);
  await page.setInputFiles("[data-testid=csv-file]", path.resolve("public/samples/companies-sample.csv"));
  await page.getByTestId("csv-validate").click();
  await page.getByTestId("import-report").waitFor();
  await page.getByTestId("csv-import").click();
  await page.getByText("Inserted & scored").waitFor();
  const rep = await page.getByTestId("import-report").innerText();
  assert(/Duplicates removed/.test(rep) && /Invalid rows/.test(rep) && /Normalised values/.test(rep), rep.slice(0, 200));
  await shot("09-import");
  // Re-import: everything valid is now a duplicate of the database
  await page.getByTestId("csv-import").click();
  await page.waitForFunction(() => /Already in database/.test(document.body.innerText));
});

await step("Admin CRUD: delete company", async () => {
  await page.goto(`${BASE}/admin/companies/${newId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByTestId(`delete-company-${newId}`).click();
  await page.waitForURL(/\/admin\/companies$/);
  const res = await page.goto(`${BASE}/companies/${newId}`);
  assert(res.status() === 404, `status ${res.status()}`);
});

await step("Mobile layout renders (390px)", async () => {
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
  const mp = await m.newPage();
  mp.on("pageerror", (e) => consoleErrors.push(`mobile :: ${e.message}`));
  await mp.goto(`${BASE}/companies`);
  await mp.getByRole("button", { name: /Filters/ }).waitFor();
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `horizontal page overflow ${overflow}px`);
  if (SHOTS) await mp.screenshot({ path: path.join(SHOTS, "10-mobile.png"), fullPage: false });
  await mp.goto(`${BASE}/companies/${beautyId}`);
  await mp.getByTestId("why-now").waitFor();
  await m.close();
});

await browser.close();
console.log(results.join("\n"));
const relevant = consoleErrors.filter((e) => !/favicon/.test(e) && !/status of 40[0-9]/.test(e));
console.log(`\nConsole errors: ${relevant.length}`);
relevant.forEach((e) => console.log("  " + e));
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed || relevant.length ? 1 : 0);
