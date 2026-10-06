import type Database from "better-sqlite3";
import { EMPLOYEE_RANGE_ORDER, fold, INDUSTRIES, PROVINCES, PROVINCE_NAMES, EMPLOYEE_RANGES } from "./constants";

export interface CompanyInput {
  company_name: string;
  tax_code?: string | null;
  short_name?: string | null;
  industry: string;
  business_description?: string | null;
  province: string;
  district?: string | null;
  address?: string | null;
  website?: string | null;
  company_status?: string | null;
  founded_date?: string | null;
  estimated_employee_range?: string | null;
  legal_entity_type?: string | null;
  public_source_url?: string | null;
  is_demo?: number;
}

export const EDITABLE_FIELDS = [
  "company_name", "tax_code", "short_name", "industry", "business_description", "province", "district", "address", "website",
  "company_status", "founded_date", "estimated_employee_range", "legal_entity_type", "public_source_url",
] as const;

export function buildSearchText(c: Partial<CompanyInput>): string {
  return fold([c.company_name, c.short_name, c.industry, c.business_description, c.province, PROVINCES[c.province ?? ""]?.short, c.district, c.address, c.website, c.tax_code].filter(Boolean).join(" "));
}

// ---------- Normalisation (shared by admin forms and CSV import) ----------

const PROVINCE_ALIASES: Record<string, string> = {
  hcm: "Ho Chi Minh City", hcmc: "Ho Chi Minh City", "tp hcm": "Ho Chi Minh City", "tp.hcm": "Ho Chi Minh City", "tphcm": "Ho Chi Minh City",
  "ho chi minh": "Ho Chi Minh City", "ho chi minh city": "Ho Chi Minh City", "tp ho chi minh": "Ho Chi Minh City", "thanh pho ho chi minh": "Ho Chi Minh City",
  saigon: "Ho Chi Minh City", "sai gon": "Ho Chi Minh City",
  hanoi: "Hanoi", "ha noi": "Hanoi", hn: "Hanoi", "tp ha noi": "Hanoi",
  "da nang": "Da Nang", danang: "Da Nang", "binh duong": "Binh Duong", "dong nai": "Dong Nai",
  "hai phong": "Hai Phong", haiphong: "Hai Phong", "can tho": "Can Tho", cantho: "Can Tho", "bac ninh": "Bac Ninh",
};

export function normalizeProvince(v: string | null | undefined): string | null {
  if (!v) return null;
  const f = fold(v).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (PROVINCE_ALIASES[f]) return PROVINCE_ALIASES[f];
  const direct = PROVINCE_NAMES.find((p) => fold(p) === f);
  if (direct) return direct;
  // Unknown provinces are accepted in title case (database is not limited to the 8 demo provinces)
  return v.trim().replace(/\s+/g, " ");
}

const INDUSTRY_ALIASES: [RegExp, string][] = [
  [/beauty|salon|spa|nail|hair|toc|tham my|cosmetic clinic/, "Beauty / Salon"],
  [/restaurant|cafe|coffee|f&b|food service|nha hang|quan an|bakery/, "Restaurant"],
  [/retail|shop|store|ban le|furniture|fashion|thoi trang|noi that/, "Retail"],
  [/manufactur|factory|san xuat|nha may|production|garment|textile|plastic/, "Manufacturing"],
  [/logistic|transport|shipping|freight|van tai|kho van|warehouse/, "Logistics"],
  [/real estate|property|bat dong san|realty/, "Real Estate"],
  [/educat|school|training|academy|giao duc|dao tao|language center/, "Education"],
  [/health|clinic|hospital|dental|nha khoa|phong kham|medical|pharma/, "Healthcare / Clinic"],
  [/tech|software|it service|cong nghe|phan mem|digital|saas/, "Technology"],
  [/construct|xay dung|building|architecture|kien truc|engineering/, "Construction"],
  [/hospitality|hotel|resort|khach san|homestay|travel|tourism|du lich/, "Hospitality"],
  [/professional|consult|accounting|ke toan|law|luat|legal|audit|hr service|tu van/, "Professional Services"],
];

export function normalizeIndustry(v: string | null | undefined): string | null {
  if (!v) return null;
  const exact = INDUSTRIES.find((i) => fold(i) === fold(v).trim());
  if (exact) return exact;
  const f = fold(v);
  for (const [re, ind] of INDUSTRY_ALIASES) if (re.test(f)) return ind;
  return null;
}

export function normalizeEmployeeRange(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.replace(/\s|employees|nhan vien|nv/gi, "");
  if ((EMPLOYEE_RANGES as readonly string[]).includes(s)) return s;
  if (/^(500\+|>500|over500|500-?)$/i.test(s)) return "500+";
  const nums = s.match(/\d+/g)?.map(Number);
  if (!nums?.length) return null;
  const n = nums.length > 1 ? Math.round((nums[0] + nums[1]) / 2) : nums[0];
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 500) return "201-500";
  return "500+";
}

export function normalizeWebsite(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = v.trim().toLowerCase();
  if (!s || ["none", "n/a", "-", "khong", "no"].includes(s)) return null;
  if (!/^https?:\/\//.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (!u.hostname.includes(".")) return null;
    return `${u.protocol}//${u.hostname}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

export function normalizeTaxCode(v: string | null | undefined): string | null {
  if (!v) return null;
  const digits = v.replace(/[^\d-]/g, "");
  return /^\d{10}(-\d{3})?$/.test(digits) ? digits : null;
}

export function normalizeName(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

/** Key used for duplicate detection when no tax code is present. */
export function dedupeKey(name: string, province: string | null): string {
  const n = fold(name)
    .replace(/\b(cong ty|cty|tnhh|co phan|cp|jsc|llc|co\.?,? ?ltd|ltd|company|mtv|mot thanh vien|dntn|ho kinh doanh)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return `${n}|${fold(province ?? "")}`;
}

// ---------- CRUD ----------

export function insertCompany(db: Database.Database, c: CompanyInput): number {
  const range = c.estimated_employee_range ?? null;
  const info = db
    .prepare(
      `INSERT INTO companies (tax_code, company_name, short_name, industry, business_description, province, district, address, website,
        company_status, founded_date, estimated_employee_range, employee_range_order, legal_entity_type, public_source_url, is_demo, search_text)
       VALUES (@tax_code, @company_name, @short_name, @industry, @business_description, @province, @district, @address, @website,
        @company_status, @founded_date, @estimated_employee_range, @order, @legal_entity_type, @public_source_url, @is_demo, @search_text)`,
    )
    .run({
      tax_code: c.tax_code ?? null,
      company_name: c.company_name,
      short_name: c.short_name ?? null,
      industry: c.industry,
      business_description: c.business_description ?? null,
      province: c.province,
      district: c.district ?? null,
      address: c.address ?? null,
      website: c.website ?? null,
      company_status: c.company_status ?? "Active",
      founded_date: c.founded_date ?? null,
      estimated_employee_range: range,
      order: range ? EMPLOYEE_RANGE_ORDER[range] ?? 0 : 0,
      legal_entity_type: c.legal_entity_type ?? null,
      public_source_url: c.public_source_url ?? null,
      is_demo: c.is_demo ?? 0,
      search_text: buildSearchText(c),
    });
  const id = Number(info.lastInsertRowid);
  db.prepare("INSERT INTO company_digital_profiles (company_id, website_exists) VALUES (?, ?)").run(id, c.website ? 1 : 0);
  return id;
}

export function updateCompany(db: Database.Database, id: number, patch: Partial<CompanyInput>) {
  const current = db.prepare("SELECT * FROM companies WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!current) throw new Error("Company not found");
  const merged = { ...current } as Record<string, unknown>;
  for (const k of EDITABLE_FIELDS) if (k in patch) merged[k] = (patch as Record<string, unknown>)[k] ?? null;
  const range = (merged.estimated_employee_range as string | null) ?? null;
  db.prepare(
    `UPDATE companies SET ${EDITABLE_FIELDS.map((k) => `${k} = @${k}`).join(", ")},
       employee_range_order = @order, search_text = @search_text, last_updated_at = datetime('now') WHERE id = @id`,
  ).run({
    ...Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, merged[k] ?? null])),
    order: range ? EMPLOYEE_RANGE_ORDER[range] ?? 0 : 0,
    search_text: buildSearchText(merged as unknown as CompanyInput),
    id,
  });
  if ("website" in patch) {
    db.prepare("INSERT OR IGNORE INTO company_digital_profiles (company_id) VALUES (?)").run(id);
    if (patch.website) db.prepare("UPDATE company_digital_profiles SET website_exists = 1 WHERE company_id = ?").run(id);
    else db.prepare("UPDATE company_digital_profiles SET website_exists = 0, website_quality_score = NULL WHERE company_id = ?").run(id);
  }
}

/** Validate & normalise an admin/CSV company payload. Returns errors (empty when valid). */
export function validateCompanyInput(raw: Record<string, unknown>): { value: CompanyInput; errors: string[] } {
  const errors: string[] = [];
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : raw[k] == null ? "" : String(raw[k]).trim());
  const company_name = normalizeName(str("company_name"));
  if (!company_name) errors.push("company_name is required");
  else if (company_name.length > 200) errors.push("company_name is too long");
  const industry = normalizeIndustry(str("industry"));
  if (!industry) errors.push(`industry "${str("industry")}" is not recognised (use one of: ${INDUSTRIES.join(", ")})`);
  const province = normalizeProvince(str("province"));
  if (!province) errors.push("province is required");
  const taxRaw = str("tax_code");
  const tax_code = normalizeTaxCode(taxRaw);
  if (taxRaw && !tax_code) errors.push(`tax_code "${taxRaw}" must be 10 digits (optionally -XXX branch suffix)`);
  const webRaw = str("website");
  const website = normalizeWebsite(webRaw);
  if (webRaw && !website && !["none", "n/a", "-", "no", "khong"].includes(webRaw.toLowerCase())) errors.push(`website "${webRaw}" is not a valid URL`);
  const rangeRaw = str("estimated_employee_range") || str("employee_range");
  const estimated_employee_range = normalizeEmployeeRange(rangeRaw);
  if (rangeRaw && !estimated_employee_range) errors.push(`employee_range "${rangeRaw}" is not recognised`);
  const founded = str("founded_date");
  if (founded && !/^\d{4}(-\d{2}-\d{2})?$/.test(founded)) errors.push("founded_date must be YYYY or YYYY-MM-DD");
  return {
    errors,
    value: {
      company_name,
      tax_code,
      short_name: str("short_name") || null,
      industry: industry ?? "",
      business_description: str("business_description") || null,
      province: province ?? "",
      district: str("district") || null,
      address: str("address") || null,
      website,
      company_status: str("company_status") || "Active",
      founded_date: founded || null,
      estimated_employee_range,
      legal_entity_type: str("legal_entity_type") || null,
      public_source_url: str("public_source_url") || null,
    },
  };
}

export function findDuplicate(db: Database.Database, c: { tax_code?: string | null; company_name: string; province: string }, excludeId?: number): { id: number; company_name: string } | null {
  if (c.tax_code) {
    const row = db.prepare("SELECT id, company_name FROM companies WHERE tax_code = ? AND id != ?").get(c.tax_code, excludeId ?? -1) as { id: number; company_name: string } | undefined;
    if (row) return row;
  }
  const key = dedupeKey(c.company_name, c.province);
  const candidates = db.prepare("SELECT id, company_name, province FROM companies WHERE province = ? AND id != ?").all(c.province, excludeId ?? -1) as { id: number; company_name: string; province: string }[];
  return candidates.find((r) => dedupeKey(r.company_name, r.province) === key) ?? null;
}
