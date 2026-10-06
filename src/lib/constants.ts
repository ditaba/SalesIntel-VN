// Shared reference data used by the UI, search, seeding, CSV import and the NL parser.

export const INDUSTRIES = [
  "Beauty / Salon",
  "Restaurant",
  "Retail",
  "Manufacturing",
  "Logistics",
  "Real Estate",
  "Education",
  "Healthcare / Clinic",
  "Technology",
  "Construction",
  "Hospitality",
  "Professional Services",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const PROVINCES: Record<string, { code: string; short: string; districts: string[] }> = {
  "Ho Chi Minh City": {
    code: "03",
    short: "HCMC",
    districts: ["District 1", "District 3", "District 7", "Binh Thanh", "Phu Nhuan", "Tan Binh", "Go Vap", "Thu Duc City", "District 10", "Tan Phu"],
  },
  Hanoi: {
    code: "01",
    short: "Hanoi",
    districts: ["Hoan Kiem", "Ba Dinh", "Dong Da", "Cau Giay", "Hai Ba Trung", "Thanh Xuan", "Tay Ho", "Long Bien", "Nam Tu Liem", "Hoang Mai"],
  },
  "Da Nang": { code: "04", short: "Da Nang", districts: ["Hai Chau", "Thanh Khe", "Son Tra", "Ngu Hanh Son", "Lien Chieu", "Cam Le"] },
  "Binh Duong": { code: "37", short: "Binh Duong", districts: ["Thu Dau Mot", "Di An", "Thuan An", "Ben Cat", "Tan Uyen"] },
  "Dong Nai": { code: "36", short: "Dong Nai", districts: ["Bien Hoa", "Long Thanh", "Nhon Trach", "Trang Bom"] },
  "Hai Phong": { code: "02", short: "Hai Phong", districts: ["Hong Bang", "Le Chan", "Ngo Quyen", "Hai An", "Duong Kinh"] },
  "Can Tho": { code: "18", short: "Can Tho", districts: ["Ninh Kieu", "Cai Rang", "Binh Thuy", "O Mon"] },
  "Bac Ninh": { code: "23", short: "Bac Ninh", districts: ["Bac Ninh City", "Tu Son", "Yen Phong", "Que Vo"] },
};
export const PROVINCE_NAMES = Object.keys(PROVINCES);

export const EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;
export type EmployeeRange = (typeof EMPLOYEE_RANGES)[number];
export const EMPLOYEE_RANGE_ORDER: Record<string, number> = { "1-10": 1, "11-50": 2, "51-200": 3, "201-500": 4, "500+": 5 };

export const LEGAL_ENTITY_TYPES = ["LLC (Cong ty TNHH)", "JSC (Cong ty Co phan)", "Sole proprietorship (DNTN)", "Household business (Ho kinh doanh)"];

export const OPPORTUNITY_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type OpportunityLevel = (typeof OPPORTUNITY_LEVELS)[number];

export const SIGNAL_TYPES = {
  HIRING: { label: "Hiring", tone: "blue", description: "Company has open public job postings" },
  SALES_HIRING: { label: "Sales Hiring", tone: "violet", description: "Hiring sales / business development staff" },
  MARKETING_HIRING: { label: "Marketing Hiring", tone: "pink", description: "Hiring marketing / digital marketing staff" },
  TECH_HIRING: { label: "Tech Hiring", tone: "cyan", description: "Hiring engineers / IT staff" },
  NEW_BRANCH: { label: "New Branch", tone: "green", description: "Opened a new branch, store, showroom or office" },
  EXPANSION: { label: "Expanding", tone: "emerald", description: "Expansion activity (new market, factory, capacity)" },
  RECENT_NEWS: { label: "Recent News", tone: "slate", description: "Company appeared in recent public news" },
  PRODUCT_LAUNCH: { label: "Product Launch", tone: "amber", description: "Launched a new product or service" },
  WEBSITE_PROBLEM: { label: "Weak Website", tone: "red", description: "Website has quality / performance issues" },
  NO_WEBSITE: { label: "No Website", tone: "red", description: "No company website found" },
  DIGITAL_GROWTH: { label: "Digital Growth", tone: "teal", description: "Growing digital presence (new channels, e-commerce)" },
  WEAK_DIGITAL_PRESENCE: { label: "Weak Digital", tone: "orange", description: "Few or no digital channels" },
} as const;
export type SignalType = keyof typeof SIGNAL_TYPES;
export const SIGNAL_TYPE_KEYS = Object.keys(SIGNAL_TYPES) as SignalType[];

export const SIGNAL_STRENGTHS = ["HIGH", "MEDIUM", "LOW"] as const;
export type SignalStrength = (typeof SIGNAL_STRENGTHS)[number];

export const OBSERVATION_TYPES = ["JOB_POSTING", "NEWS", "WEBSITE_SCAN", "COMPANY_REGISTRY", "SOCIAL_PRESENCE"] as const;
export type ObservationType = (typeof OBSERVATION_TYPES)[number];

export const SORT_OPTIONS = [
  { value: "score", label: "Opportunity Score" },
  { value: "signal", label: "Most recent signal" },
  { value: "size", label: "Company size" },
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Company name" },
] as const;

/** Fold Vietnamese text to ASCII lowercase for diacritic-insensitive search. */
export function fold(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}
