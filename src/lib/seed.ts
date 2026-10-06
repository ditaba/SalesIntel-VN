// DEMO DATA GENERATOR
// -------------------------------------------------------------------------------------------
// Every company created here is SAMPLE DATA (is_demo = 1). Names, tax codes, addresses, websites,
// job postings and news are synthetic and do not describe real businesses. Source URLs point to the
// reserved example.org domain so they can never be mistaken for real public records.
//
// Raw observations (job postings, news, website scans, social checks) are generated as TEXT and run
// through the real signal engine, so the demo exercises the same pipeline future crawlers will use.

import type Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { fold, PROVINCES, type Industry } from "./constants";
import { insertCompany } from "./companies";
import { processPendingObservations } from "./signals";
import { recomputeCompany } from "./analysis";

export const DEMO_BASE = "https://example.org/salesintel-demo";

// ---------- deterministic PRNG ----------
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(20261006);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
}

// ---------- vocabulary ----------
const BRAND_WORDS = [
  "Minh Anh", "Hoàng Gia", "Phú Thịnh", "An Khang", "Thành Đạt", "Sao Mai", "Bình Minh", "Hưng Thịnh", "Tân Phát", "Việt Á",
  "Đại Nam", "Kim Long", "Phương Đông", "Ánh Dương", "Hải Âu", "Sen Vàng", "Mekong", "Trường Sơn", "Thiên Long", "Hồng Hà",
  "Gia Phát", "Nam Việt", "Bảo Ngọc", "Ngọc Lan", "Hoa Mai", "Thảo Nguyên", "Đông Á", "Việt Tiến", "Tâm An", "Phúc Lộc",
  "Song Long", "Vạn Xuân", "Hòa Bình", "Cát Tường", "Thịnh Vượng", "Khánh An", "Tường Vy", "Mộc Lan", "Lam Sơn", "Bắc Hà",
  "Sông Hàn", "Cửu Long", "Tây Đô", "Kinh Bắc", "Hải Đăng", "Trí Việt", "Nhật Minh", "Quang Huy", "Đức Tín", "Hợp Nhất",
  "Tín Nghĩa", "Phát Đạt", "Hoàng Long", "Thái Bình", "Mai Linh", "Hương Giang", "Lotus", "Sunrise", "Green Leaf", "Blue Ocean",
  "Golden Star", "Saigon Pearl", "Red River", "Silver Moon", "Bamboo", "Jade", "Orchid", "Harmony", "Vina Star", "Ocean Gate",
  "Ngọc Trai", "Thanh Xuân", "Hạ Long", "Phù Sa", "Sơn Trà", "Mỹ Khê", "Hòa Phát Đạt", "Vĩnh Phúc", "Bảo An", "Thuận Phát",
] as const;

const STREETS: Record<string, string[]> = {
  "Ho Chi Minh City": ["Nguyễn Trãi", "Lê Lợi", "Điện Biên Phủ", "Cách Mạng Tháng Tám", "Nguyễn Thị Minh Khai", "Võ Văn Tần", "Phan Xích Long", "Nguyễn Văn Linh", "Lê Văn Sỹ", "Hoàng Văn Thụ", "Phạm Văn Đồng", "Quang Trung"],
  Hanoi: ["Trần Duy Hưng", "Láng Hạ", "Kim Mã", "Bà Triệu", "Xuân Thủy", "Nguyễn Chí Thanh", "Hoàng Quốc Việt", "Lạc Long Quân", "Tôn Đức Thắng", "Nguyễn Trãi", "Phạm Hùng"],
  "Da Nang": ["Nguyễn Văn Linh", "Bạch Đằng", "Võ Nguyên Giáp", "Lê Duẩn", "Hùng Vương", "Nguyễn Tất Thành", "Trần Phú"],
  "Binh Duong": ["Đại lộ Bình Dương", "Yersin", "Nguyễn Văn Tiết", "Đường DT743", "Mỹ Phước Tân Vạn", "KCN VSIP 1, Đường số 3"],
  "Dong Nai": ["Phạm Văn Thuận", "Đồng Khởi", "KCN Amata, Đường 2", "Quốc lộ 51", "KCN Nhơn Trạch 3"],
  "Hai Phong": ["Lạch Tray", "Lê Hồng Phong", "Trần Phú", "Đình Vũ", "Văn Cao", "KCN Đình Vũ"],
  "Can Tho": ["Đường 30/4", "Nguyễn Văn Cừ", "Trần Hưng Đạo", "Mậu Thân", "Võ Văn Kiệt"],
  "Bac Ninh": ["Lý Thái Tổ", "Nguyễn Gia Thiều", "KCN Yên Phong", "KCN Quế Võ", "Trần Hưng Đạo"],
};

interface IndustryCfg {
  legalWord: string;
  kinds: [string, string][]; // [brand template with "{W}" placeholder, matching description]
  sizes: [string, number][];
  provinces: [string, number][];
  noWebsite: number;
  weakWebsite: number;
  opsJobs: string[]; // "{n}" placeholder
  branchNews: string[]; // {S} brand, {D} district, {P} province, {K} ordinal
  expansionNews: string[];
  productNews: string[];
  bookingRelevant?: boolean;
  householdShare?: number;
}

const ALL_PROV: [string, number][] = [["Ho Chi Minh City", 34], ["Hanoi", 26], ["Da Nang", 9], ["Binh Duong", 6], ["Dong Nai", 5], ["Hai Phong", 7], ["Can Tho", 7], ["Bac Ninh", 6]];
const INDUSTRIAL_PROV: [string, number][] = [["Binh Duong", 24], ["Dong Nai", 20], ["Bac Ninh", 18], ["Hai Phong", 16], ["Ho Chi Minh City", 12], ["Hanoi", 8], ["Da Nang", 4], ["Can Tho", 4]];

const CFG: Record<Industry, IndustryCfg> = {
  "Beauty / Salon": {
    legalWord: "Thẩm mỹ",
    kinds: [["{W} Spa", "Day spa providing facial care, body massage and skincare packages"], ["{W} Beauty", "Beauty salon offering hair styling, nails and skincare services"], ["Hair Salon {W}", "Hair salon offering cutting, colouring, perm and keratin treatments"], ["Nail {W}", "Nail studio offering manicure, pedicure and gel nail art"], ["{W} Beauty Clinic", "Beauty clinic offering skincare treatments, hair removal and facials"], ["Tóc {W}", "Hair salon specialising in men's and women's cuts and colouring"], ["{W} Lash & Brow", "Eyelash extension and brow styling studio"]],
    sizes: [["1-10", 45], ["11-50", 45], ["51-200", 10]],
    provinces: ALL_PROV,
    noWebsite: 0.3,
    weakWebsite: 0.45,
    opsJobs: ["Tuyển {n} Kỹ thuật viên Spa", "Tuyển {n} Thợ phụ tóc", "Hiring {n} nail technicians", "Tuyển {n} lễ tân spa"],
    branchNews: ["{S} khai trương chi nhánh thứ {K} tại {D}", "{S} opens its {K} salon in {D}, {P}", "{S} khai trương cơ sở mới tại {D}"],
    expansionNews: ["{S} mở rộng quy mô, nâng cấp cơ sở lên 3 tầng tại {D}", "{S} expands into franchising across {P}"],
    productNews: ["{S} ra mắt gói chăm sóc da công nghệ cao", "{S} launches a new membership program for regular clients"],
    bookingRelevant: true,
    householdShare: 0.3,
  },
  Restaurant: {
    legalWord: "Dịch vụ Ăn uống",
    kinds: [["Nhà hàng {W}", "Vietnamese restaurant serving traditional northern dishes"], ["{W} Coffee", "Specialty coffee chain with roastery and takeaway kiosks"], ["Phở {W}", "Pho restaurant serving breakfast and lunch to office workers"], ["Bếp {W}", "Casual dining restaurant with delivery via food apps"], ["Lẩu {W}", "Hotpot and grill restaurant for families and groups"], ["{W} Kitchen", "Fusion kitchen and catering service for corporate events"], ["Bánh mì {W}", "Banh mi kiosk chain focused on takeaway and delivery"], ["Cơm Niêu {W}", "Clay-pot rice restaurant serving family meals"]],
    sizes: [["1-10", 25], ["11-50", 50], ["51-200", 20], ["201-500", 5]],
    provinces: ALL_PROV,
    noWebsite: 0.35,
    weakWebsite: 0.4,
    opsJobs: ["Tuyển {n} nhân viên phục vụ", "Tuyển {n} Phụ bếp", "Hiring {n} baristas", "Tuyển {n} Quản lý cửa hàng (Store Manager)"],
    branchNews: ["{S} khai trương cửa hàng mới tại {D}", "{S} opens its {K} outlet in {D}, {P}", "{S} khai trương chi nhánh thứ {K} tại {P}"],
    expansionNews: ["{S} nhận chuyển nhượng nhượng quyền, mở rộng ra {P}", "{S} invests 12 billion VND in a central kitchen to expand capacity"],
    productNews: ["{S} ra mắt thực đơn mùa thu mới", "{S} launches online ordering for office lunch sets"],
    bookingRelevant: true,
    householdShare: 0.25,
  },
  Retail: {
    legalWord: "Thương mại",
    kinds: [["Nội thất {W}", "Furniture retailer selling sofas, dining sets and home décor"], ["Thời trang {W}", "Fashion retail chain for women's office wear"], ["Điện máy {W}", "Consumer electronics and home appliance retailer"], ["Mẹ & Bé {W}", "Mother & baby products store chain"], ["Mỹ phẩm {W}", "Cosmetics and personal care retailer with physical stores"], ["{W} Mart", "Mini-mart chain serving residential neighbourhoods"], ["{W} Furniture", "Furniture showroom selling wooden and rattan furniture"], ["Đồng hồ {W}", "Watch and accessories retailer"]],
    sizes: [["1-10", 15], ["11-50", 40], ["51-200", 30], ["201-500", 10], ["500+", 5]],
    provinces: ALL_PROV,
    noWebsite: 0.15,
    weakWebsite: 0.45,
    opsJobs: ["Tuyển {n} Nhân viên bán hàng tại cửa hàng", "Tuyển {n} Thủ kho", "Hiring {n} store cashiers", "Tuyển {n} nhân viên giao hàng"],
    branchNews: ["{S} khai trương showroom mới tại {D}", "{S} opens its {K} showroom in {D}, {P}", "{S} khai trương cửa hàng thứ {K} tại {P}"],
    expansionNews: ["{S} mở rộng hệ thống phân phối ra {P}", "{S} expands warehouse capacity to support new stores"],
    productNews: ["{S} ra mắt dòng sản phẩm mới mùa lễ hội", "{S} launches an exclusive private-label collection"],
  },
  Manufacturing: {
    legalWord: "Sản xuất",
    kinds: [["{W} Plastics", "Plastic injection moulding for consumer and automotive parts"], ["Cơ khí {W}", "Precision mechanical engineering and CNC machining"], ["Bao bì {W}", "Corrugated carton and flexible packaging manufacturer"], ["Dệt may {W}", "Garment manufacturer producing for export brands"], ["Gỗ {W}", "Wooden furniture manufacturer for US and EU export markets"], ["Thực phẩm {W}", "Food processing company producing snacks and dried fruit"], ["{W} Industrial", "Industrial equipment fabrication and steel structures"], ["Điện tử {W}", "Electronic component assembly for EMS customers"]],
    sizes: [["11-50", 15], ["51-200", 40], ["201-500", 30], ["500+", 15]],
    provinces: INDUSTRIAL_PROV,
    noWebsite: 0.12,
    weakWebsite: 0.5,
    opsJobs: ["Tuyển {n} công nhân may", "Tuyển {n} Công nhân vận hành máy", "Hiring {n} QC inspectors", "Tuyển {n} Kỹ sư cơ khí", "Tuyển {n} nhân viên kho"],
    branchNews: ["{S} khánh thành nhà máy thứ {K} tại {P}", "{S} opens a new sales office in {D}, {P}"],
    expansionNews: ["{S} đầu tư 150 tỷ đồng xây dựng nhà máy mới tại {P}", "{S} expands production capacity by 40% to serve export orders", "{S} mở rộng nhà xưởng thêm 8.000 m2"],
    productNews: ["{S} ra mắt dòng sản phẩm thân thiện môi trường", "{S} launches a new product line for the domestic market"],
  },
  Logistics: {
    legalWord: "Logistics",
    kinds: [["{W} Logistics", "Freight forwarding and customs clearance services"], ["Vận tải {W}", "Container trucking between ports and industrial parks"], ["{W} Express", "Last-mile delivery for e-commerce merchants"], ["Kho vận {W}", "Warehouse and fulfilment services for online sellers"], ["{W} Shipping", "Sea freight and cold-chain transport services"]],
    sizes: [["11-50", 30], ["51-200", 40], ["201-500", 20], ["500+", 10]],
    provinces: [["Hai Phong", 25], ["Ho Chi Minh City", 25], ["Binh Duong", 15], ["Dong Nai", 10], ["Hanoi", 15], ["Da Nang", 5], ["Can Tho", 3], ["Bac Ninh", 2]],
    noWebsite: 0.1,
    weakWebsite: 0.45,
    opsJobs: ["Tuyển {n} tài xế xe tải", "Tuyển {n} nhân viên chứng từ (Documentation)", "Hiring {n} warehouse staff", "Tuyển {n} Điều phối vận tải"],
    branchNews: ["{S} khai trương chi nhánh mới tại {P}", "{S} opens a new branch office in {D}, {P}"],
    expansionNews: ["{S} mở rộng kho bãi 20.000 m2 tại {P}", "{S} invests in 50 new trucks to expand its fleet", "{S} expands cold-chain network to the Mekong Delta"],
    productNews: ["{S} ra mắt dịch vụ giao hàng trong 2 giờ", "{S} launches a shipment tracking app for customers"],
  },
  "Real Estate": {
    legalWord: "Bất động sản",
    kinds: [["Bất động sản {W}", "Real estate brokerage for apartments and townhouses"], ["{W} Land", "Residential project developer in satellite urban areas"], ["{W} Realty", "Real estate agency focusing on land plots and villas"], ["{W} Homes", "Residential developer of townhouses and shophouses"], ["Địa ốc {W}", "Commercial office leasing and property management"]],
    sizes: [["1-10", 15], ["11-50", 45], ["51-200", 30], ["201-500", 10]],
    provinces: ALL_PROV,
    noWebsite: 0.1,
    weakWebsite: 0.4,
    opsJobs: ["Tuyển {n} chuyên viên tư vấn bất động sản", "Tuyển {n} Nhân viên hành chính"],
    branchNews: ["{S} khai trương văn phòng mới tại {D}", "{S} opens a new sales gallery in {D}, {P}"],
    expansionNews: ["{S} mở rộng hoạt động sang thị trường {P}", "{S} announces a new 2,000-unit residential project"],
    productNews: ["{S} ra mắt dự án căn hộ mới tại {D}", "{S} launches a virtual tour platform for buyers"],
  },
  Education: {
    legalWord: "Giáo dục",
    kinds: [["Anh ngữ {W}", "English language centre for children and teenagers"], ["{W} Academy", "IELTS and TOEIC test preparation academy"], ["Trung tâm Tin học {W}", "Vocational training centre for office and IT skills"], ["Mầm non {W}", "Private kindergarten with bilingual programme"], ["{W} Edu", "Coding and robotics school for kids"], ["Kỹ năng sống {W}", "Life-skills and soft-skills courses for students"]],
    sizes: [["1-10", 20], ["11-50", 50], ["51-200", 25], ["201-500", 5]],
    provinces: ALL_PROV,
    noWebsite: 0.15,
    weakWebsite: 0.45,
    opsJobs: ["Tuyển {n} giáo viên tiếng Anh", "Tuyển {n} Trợ giảng", "Hiring {n} student counsellors", "Tuyển {n} giáo viên mầm non"],
    branchNews: ["{S} khai trương cơ sở thứ {K} tại {D}", "{S} opens a new campus in {D}, {P}"],
    expansionNews: ["{S} mở rộng chương trình học ra {P}", "{S} expands online learning to students nationwide"],
    productNews: ["{S} ra mắt khóa học IELTS cấp tốc", "{S} launches a new STEM programme"],
    bookingRelevant: true,
  },
  "Healthcare / Clinic": {
    legalWord: "Y tế",
    kinds: [["Nha khoa {W}", "Dental clinic offering implants, braces and cosmetic dentistry"], ["Phòng khám {W}", "General outpatient clinic with diagnostic imaging"], ["{W} Medical", "Physiotherapy and rehabilitation clinic"], ["Phòng khám Đa khoa {W}", "Multi-specialty clinic with laboratory and vaccination services"], ["{W} Dental", "Dental clinic focusing on orthodontics and implants"], ["Mắt {W}", "Ophthalmology and eye-care clinic"]],
    sizes: [["1-10", 20], ["11-50", 50], ["51-200", 25], ["201-500", 5]],
    provinces: ALL_PROV,
    noWebsite: 0.15,
    weakWebsite: 0.45,
    opsJobs: ["Tuyển {n} Điều dưỡng", "Tuyển {n} Bác sĩ Răng Hàm Mặt", "Hiring {n} clinic receptionists", "Tuyển {n} kỹ thuật viên xét nghiệm"],
    branchNews: ["{S} khai trương phòng khám thứ {K} tại {D}", "{S} opens a new clinic in {D}, {P}"],
    expansionNews: ["{S} đầu tư 20 tỷ đồng nâng cấp thiết bị chẩn đoán", "{S} expands with a new specialist department"],
    productNews: ["{S} ra mắt dịch vụ khám sức khỏe doanh nghiệp", "{S} launches online consultation service"],
    bookingRelevant: true,
  },
  Technology: {
    legalWord: "Công nghệ",
    kinds: [["{W} Software", "Software outsourcing company serving Japanese and Australian clients"], ["{W} Tech", "SaaS provider of POS software for F&B businesses"], ["{W} Solutions", "System integrator for network and security infrastructure"], ["{W} Digital", "Mobile app development studio"], ["{W} Labs", "Data analytics and BI consulting firm"], ["{W} Systems", "ERP implementation partner for manufacturing SMEs"]],
    sizes: [["11-50", 35], ["51-200", 40], ["201-500", 20], ["500+", 5]],
    provinces: [["Hanoi", 38], ["Ho Chi Minh City", 38], ["Da Nang", 18], ["Can Tho", 3], ["Hai Phong", 3]],
    noWebsite: 0.02,
    weakWebsite: 0.2,
    opsJobs: ["Hiring {n} Java Developers", "Tuyển {n} Lập trình viên ReactJS", "Hiring {n} QA engineers", "Tuyển {n} Kỹ sư DevOps"],
    branchNews: ["{S} opens a new development centre in {P}", "{S} khai trương văn phòng mới tại {D}"],
    expansionNews: ["{S} expands to Japan with a new subsidiary", "{S} receives 2 million USD investment to expand its product"],
    productNews: ["{S} launches an AI-powered customer service product", "{S} ra mắt nền tảng quản lý bán hàng mới"],
  },
  Construction: {
    legalWord: "Xây dựng",
    kinds: [["Xây dựng {W}", "Design-and-build contractor for townhouses and villas"], ["{W} Construction", "Industrial construction contractor for factories and warehouses"], ["Kiến trúc {W}", "Architecture and interior design studio"], ["Cơ điện {W}", "MEP contractor for commercial buildings"], ["{W} E&C", "General contractor for commercial and residential projects"], ["Nội thất xây dựng {W}", "Interior fit-out contractor for offices and retail"]],
    sizes: [["11-50", 35], ["51-200", 40], ["201-500", 20], ["500+", 5]],
    provinces: ALL_PROV,
    noWebsite: 0.15,
    weakWebsite: 0.5,
    opsJobs: ["Tuyển {n} Kỹ sư xây dựng", "Tuyển {n} chỉ huy trưởng công trình", "Hiring {n} site supervisors", "Tuyển {n} Kỹ sư dự toán"],
    branchNews: ["{S} opens a new branch office in {P}", "{S} khai trương văn phòng đại diện tại {P}"],
    expansionNews: ["{S} trúng thầu dự án nhà xưởng 300 tỷ đồng, mở rộng quy mô", "{S} expands into industrial construction in {P}"],
    productNews: ["{S} ra mắt gói thiết kế thi công nhà phố trọn gói", "{S} launches a green-building consulting service"],
  },
  Hospitality: {
    legalWord: "Du lịch",
    kinds: [["Khách sạn {W}", "Boutique hotel near the city centre"], ["{W} Hotel", "Business hotel with meeting rooms and restaurant"], ["{W} Homestay", "Homestay chain for domestic travellers"], ["{W} Resort", "Beachfront resort with spa and conference facilities"], ["{W} Boutique Hotel", "Serviced apartments and boutique rooms for business travellers"], ["{W} Travel", "Tour operator specialising in domestic and Central Vietnam tours"]],
    sizes: [["1-10", 20], ["11-50", 40], ["51-200", 30], ["201-500", 10]],
    provinces: [["Da Nang", 35], ["Ho Chi Minh City", 20], ["Hanoi", 20], ["Hai Phong", 8], ["Can Tho", 10], ["Bac Ninh", 2], ["Binh Duong", 3], ["Dong Nai", 2]],
    noWebsite: 0.12,
    weakWebsite: 0.45,
    opsJobs: ["Tuyển {n} lễ tân khách sạn", "Tuyển {n} Nhân viên buồng phòng", "Hiring {n} tour guides", "Tuyển {n} đầu bếp"],
    branchNews: ["{S} khai trương cơ sở thứ {K} tại {D}", "{S} opens a new property in {D}, {P}"],
    expansionNews: ["{S} mở rộng thêm 40 phòng đón mùa du lịch", "{S} invests 60 billion VND to renovate and expand its resort"],
    productNews: ["{S} ra mắt gói nghỉ dưỡng cuối tuần", "{S} launches MICE packages for corporate clients"],
    bookingRelevant: true,
  },
  "Professional Services": {
    legalWord: "Tư vấn",
    kinds: [["Kế toán {W}", "Accounting and tax services for SMEs"], ["Luật {W}", "Law firm specialising in corporate and investment law"], ["{W} Consulting", "Management consulting for family businesses"], ["Tư vấn {W}", "Business registration and licensing consultancy"], ["{W} HR Solutions", "Recruitment and HR outsourcing agency"], ["Kiểm toán {W}", "Independent audit firm"]],
    sizes: [["1-10", 30], ["11-50", 45], ["51-200", 20], ["201-500", 5]],
    provinces: ALL_PROV,
    noWebsite: 0.12,
    weakWebsite: 0.45,
    opsJobs: ["Tuyển {n} Kế toán viên", "Tuyển {n} Chuyên viên pháp lý", "Hiring {n} HR consultants", "Tuyển {n} trợ lý kiểm toán"],
    branchNews: ["{S} khai trương văn phòng mới tại {D}", "{S} opens a new office in {P}"],
    expansionNews: ["{S} mở rộng dịch vụ ra thị trường {P}", "{S} expands its team to serve FDI clients"],
    productNews: ["{S} ra mắt gói dịch vụ kế toán trọn gói cho startup", "{S} launches an online legal advisory service"],
  },
};

const SALES_JOBS = [
  "Tuyển {n} Nhân viên Kinh doanh (Sales Executive)",
  "{S} is recruiting {n} sales staff",
  "Hiring {n} Business Development Executives",
  "Tuyển {n} nhân viên tư vấn bán hàng",
  "Tuyển Trưởng phòng Kinh doanh (Sales Manager)",
  "Tuyển {n} Telesales",
];
const MARKETING_JOBS = [
  "Tuyển Chuyên viên Digital Marketing",
  "Hiring {n} Marketing Executives (content & social media)",
  "Tuyển {n} nhân viên Marketing Online",
  "Tuyển Trưởng phòng Marketing",
  "Hiring a Performance Marketing Specialist (Facebook/Google Ads)",
  "Tuyển {n} Content Creator (TikTok, Facebook)",
];
const TECH_JOBS = ["Tuyển {n} Lập trình viên Web", "Hiring {n} IT support engineers", "Tuyển Kỹ sư phần mềm (Software Engineer)", "Hiring a Data Analyst"];
const GENERIC_NEWS = [
  "{S} được vinh danh trong Top doanh nghiệp tiêu biểu {P}",
  "{S} sponsors a community charity run in {P}",
  "{S} signs a partnership agreement with a Japanese distributor",
  "{S} tham gia hội chợ thương mại quốc tế tại TP.HCM",
  "{S} featured in a local business magazine interview",
  "{S} tổ chức kỷ niệm 10 năm thành lập",
];

const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth"];
const ORD_VI = ["", "nhất", "hai", "ba", "tư", "năm", "sáu"];

function fill(tpl: string, v: Record<string, string | number>) {
  return tpl.replace(/\{(\w)\}/g, (_, k) => String(v[k] ?? ""));
}

function slug(s: string) {
  return fold(s).replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

// ---------- spec types ----------
interface ObsSpec {
  type: "JOB_POSTING" | "NEWS" | "WEBSITE_SCAN" | "COMPANY_REGISTRY" | "SOCIAL_PRESENCE";
  text: string;
  daysAgo: number;
  path: string;
}

interface CompanySpec {
  company_name: string;
  short_name: string;
  industry: Industry;
  description: string;
  province: string;
  district: string;
  address: string;
  website: string | null;
  employee_range: string;
  legal_entity_type: string;
  founded: string;
  tax_code: string;
  observations: ObsSpec[];
}

const usedTax = new Set<string>();
function taxCode(province: string) {
  let t: string;
  do t = PROVINCES[province].code + String(int(0, 99_999_999)).padStart(8, "0");
  while (usedTax.has(t));
  usedTax.add(t);
  return t;
}

function websiteScan(website: string | null, quality: number | null, opts: { booking?: boolean; ecommerce?: boolean; mobile?: boolean } = {}) {
  if (!website) return "Website scan: no website found for the company name in public search results; status=none";
  const q = quality ?? 60;
  const mobile = opts.mobile ?? q >= 55;
  const https = q >= 40 || chance(0.4);
  const year = q >= 70 ? int(2023, 2026) : q >= 50 ? int(2020, 2024) : int(2015, 2021);
  const load = q >= 60 ? (1 + rnd() * 2).toFixed(1) : (3 + rnd() * 6).toFixed(1);
  return `Website scan: url=${website}; status=200; quality_score=${q}; mobile_friendly=${mobile ? "yes" : "no"}; https=${https ? "yes" : "no"}; load_time_s=${load}; online_booking=${opts.booking ? "yes" : "no"}; ecommerce=${opts.ecommerce ? "yes" : "no"}; last_updated=${year}`;
}

function socialScan(fb: boolean, li: boolean, gb: boolean, followers: number, growth: number, newChannels = "none") {
  return `Social presence check: facebook_page=${fb ? "yes" : "no"}; facebook_followers=${fb ? followers : 0}; follower_growth_90d=${growth}%; linkedin_page=${li ? "yes" : "no"}; google_business_profile=${gb ? "yes" : "no"}; new_channels=${newChannels}`;
}

// ---------- hand-written hero companies (drive the documented demo scenario) ----------
function heroCompanies(): CompanySpec[] {
  const H = (o: Omit<CompanySpec, "tax_code">): CompanySpec => ({ ...o, tax_code: taxCode(o.province) });
  return [
    H({
      company_name: "Công ty TNHH Thẩm mỹ Beauty House",
      short_name: "Beauty House",
      industry: "Beauty / Salon",
      description: "Hair & beauty salon chain offering styling, colouring, nail and skincare services",
      province: "Ho Chi Minh City",
      district: "District 3",
      address: "128 Võ Văn Tần, Phường 6, District 3, Ho Chi Minh City",
      website: "https://beautyhouse-demo.vn",
      employee_range: "11-50",
      legal_entity_type: "LLC (Cong ty TNHH)",
      founded: "2017-03-15",
      observations: [
        { type: "NEWS", text: "Beauty House khai trương chi nhánh thứ ba tại District 7, TP.HCM", daysAgo: 4, path: "news/beauty-house-third-branch" },
        { type: "JOB_POSTING", text: "Beauty House tuyển 2 Nhân viên Marketing Online (Facebook, TikTok, Zalo OA)", daysAgo: 6, path: "jobs/beauty-house-marketing" },
        { type: "JOB_POSTING", text: "Tuyển 3 nhân viên tư vấn bán hàng (Sales) cho chi nhánh mới District 7", daysAgo: 8, path: "jobs/beauty-house-sales" },
        { type: "JOB_POSTING", text: "Tuyển 4 Kỹ thuật viên Spa & Nail cho chi nhánh mới", daysAgo: 8, path: "jobs/beauty-house-technicians" },
        { type: "WEBSITE_SCAN", text: "Website scan: url=https://beautyhouse-demo.vn; status=200; quality_score=31; mobile_friendly=no; https=yes; load_time_s=7.8; online_booking=no; ecommerce=no; last_updated=2018", daysAgo: 20, path: "scan/beauty-house" },
        { type: "SOCIAL_PRESENCE", text: socialScan(true, false, false, 380, 9), daysAgo: 20, path: "social/beauty-house" },
      ],
    }),
    H({
      company_name: "Hộ kinh doanh Hair Studio ABC",
      short_name: "Hair Studio ABC",
      industry: "Beauty / Salon",
      description: "Hair studio specialising in Korean-style cuts, colouring and perms",
      province: "Ho Chi Minh City",
      district: "Phu Nhuan",
      address: "45 Phan Xích Long, Phường 2, Phu Nhuan, Ho Chi Minh City",
      website: null,
      employee_range: "11-50",
      legal_entity_type: "Household business (Ho kinh doanh)",
      founded: "2020-08-01",
      observations: [
        { type: "NEWS", text: "Hair Studio ABC opens its second salon in Binh Thanh after strong demand", daysAgo: 10, path: "news/hair-studio-abc-second-salon" },
        { type: "JOB_POSTING", text: "Hair Studio ABC tuyển 1 nhân viên Marketing Online (content TikTok)", daysAgo: 7, path: "jobs/hair-studio-abc-marketing" },
        { type: "JOB_POSTING", text: "Tuyển 1 nhân viên tư vấn bán hàng (lễ tân sales)", daysAgo: 7, path: "jobs/hair-studio-abc-sales" },
        { type: "JOB_POSTING", text: "Tuyển 2 Thợ phụ tóc", daysAgo: 12, path: "jobs/hair-studio-abc-assistants" },
        { type: "WEBSITE_SCAN", text: "Website scan: no website found for the company name in public search results; status=none", daysAgo: 21, path: "scan/hair-studio-abc" },
        { type: "SOCIAL_PRESENCE", text: socialScan(true, false, false, 3100, 15), daysAgo: 21, path: "social/hair-studio-abc" },
      ],
    }),
    H({
      company_name: "Công ty TNHH Luxury Salon XYZ",
      short_name: "Luxury Salon XYZ",
      industry: "Beauty / Salon",
      description: "Premium hair and nail salon serving office workers in the city centre",
      province: "Ho Chi Minh City",
      district: "District 1",
      address: "62 Lê Lợi, Phường Bến Nghé, District 1, Ho Chi Minh City",
      website: "https://luxurysalonxyz-demo.vn",
      employee_range: "11-50",
      legal_entity_type: "LLC (Cong ty TNHH)",
      founded: "2019-01-10",
      observations: [
        { type: "NEWS", text: "Luxury Salon XYZ khai trương cơ sở mới tại Thu Duc City", daysAgo: 22, path: "news/luxury-salon-xyz-new-location" },
        { type: "NEWS", text: "Luxury Salon XYZ mở rộng quy mô, nâng cấp salon District 1 lên 3 tầng", daysAgo: 35, path: "news/luxury-salon-xyz-expansion" },
        { type: "JOB_POSTING", text: "Tuyển 2 nhân viên Marketing Online", daysAgo: 24, path: "jobs/luxury-salon-xyz-marketing" },
        { type: "JOB_POSTING", text: "Tuyển 4 Kỹ thuật viên Nail", daysAgo: 25, path: "jobs/luxury-salon-xyz-nail" },
        { type: "WEBSITE_SCAN", text: "Website scan: url=https://luxurysalonxyz-demo.vn; status=200; quality_score=41; mobile_friendly=no; https=yes; load_time_s=5.6; online_booking=no; ecommerce=no; last_updated=2020", daysAgo: 30, path: "scan/luxury-salon-xyz" },
        { type: "SOCIAL_PRESENCE", text: socialScan(true, false, false, 420, 3), daysAgo: 30, path: "social/luxury-salon-xyz" },
      ],
    }),
    H({
      company_name: "Công ty Cổ phần Nội thất ABC Furniture",
      short_name: "ABC Furniture",
      industry: "Retail",
      description: "Furniture retailer selling sofas, dining sets and home décor through showrooms",
      province: "Ho Chi Minh City",
      district: "District 7",
      address: "1023 Nguyễn Văn Linh, Tân Phong, District 7, Ho Chi Minh City",
      website: "https://abcfurniture-demo.vn",
      employee_range: "51-200",
      legal_entity_type: "JSC (Cong ty Co phan)",
      founded: "2012-05-20",
      observations: [
        { type: "NEWS", text: "ABC Furniture opens its third showroom in Thu Duc City", daysAgo: 3, path: "news/abc-furniture-showroom" },
        { type: "JOB_POSTING", text: "ABC Furniture is recruiting 3 sales staff for the new showroom", daysAgo: 9, path: "jobs/abc-furniture-sales" },
        { type: "JOB_POSTING", text: "Hiring 1 Marketing Executive (content & social media)", daysAgo: 12, path: "jobs/abc-furniture-marketing" },
        { type: "JOB_POSTING", text: "Tuyển 3 nhân viên giao hàng & lắp đặt", daysAgo: 12, path: "jobs/abc-furniture-delivery" },
        { type: "WEBSITE_SCAN", text: "Website scan: url=https://abcfurniture-demo.vn; status=200; quality_score=44; mobile_friendly=no; https=yes; load_time_s=6.1; online_booking=no; ecommerce=no; last_updated=2019", daysAgo: 25, path: "scan/abc-furniture" },
        { type: "SOCIAL_PRESENCE", text: socialScan(true, false, true, 12500, 11), daysAgo: 25, path: "social/abc-furniture" },
      ],
    }),
    H({
      company_name: "Công ty TNHH XYZ Logistics Việt Nam",
      short_name: "XYZ Logistics",
      industry: "Logistics",
      description: "Freight forwarding, container trucking and bonded warehousing near Hai Phong port",
      province: "Hai Phong",
      district: "Hai An",
      address: "Lô 12, KCN Đình Vũ, Hai An, Hai Phong",
      website: "https://xyzlogistics-demo.vn",
      employee_range: "201-500",
      legal_entity_type: "LLC (Cong ty TNHH)",
      founded: "2009-11-02",
      observations: [
        { type: "NEWS", text: "XYZ Logistics mở rộng kho bãi 20.000 m2 tại Hai Phong, đầu tư 80 tỷ đồng", daysAgo: 6, path: "news/xyz-logistics-warehouse" },
        { type: "NEWS", text: "XYZ Logistics opens a new branch office in Binh Duong", daysAgo: 18, path: "news/xyz-logistics-branch" },
        { type: "JOB_POSTING", text: "Tuyển 5 Nhân viên Kinh doanh logistics (Sales Executive)", daysAgo: 5, path: "jobs/xyz-logistics-sales" },
        { type: "JOB_POSTING", text: "Tuyển 8 tài xế xe đầu kéo", daysAgo: 11, path: "jobs/xyz-logistics-drivers" },
        { type: "WEBSITE_SCAN", text: "Website scan: url=https://xyzlogistics-demo.vn; status=200; quality_score=46; mobile_friendly=no; https=yes; load_time_s=4.2; online_booking=no; ecommerce=no; last_updated=2021", daysAgo: 30, path: "scan/xyz-logistics" },
        { type: "SOCIAL_PRESENCE", text: socialScan(true, true, true, 2300, 6), daysAgo: 30, path: "social/xyz-logistics" },
      ],
    }),
    H({
      company_name: "Công ty TNHH Giáo dục Sunrise Education",
      short_name: "Sunrise Education",
      industry: "Education",
      description: "English language and IELTS centre for children and teenagers",
      province: "Hanoi",
      district: "Cau Giay",
      address: "88 Xuân Thủy, Dịch Vọng Hậu, Cau Giay, Hanoi",
      website: "https://sunrise-edu-demo.vn",
      employee_range: "51-200",
      legal_entity_type: "LLC (Cong ty TNHH)",
      founded: "2015-09-05",
      observations: [
        { type: "NEWS", text: "Sunrise Education khai trương cơ sở thứ tư tại Thanh Xuan", daysAgo: 13, path: "news/sunrise-fourth-campus" },
        { type: "JOB_POSTING", text: "Hiring 2 Marketing Executives (content & social media) for enrolment season", daysAgo: 9, path: "jobs/sunrise-marketing" },
        { type: "JOB_POSTING", text: "Tuyển 6 giáo viên tiếng Anh", daysAgo: 15, path: "jobs/sunrise-teachers" },
        { type: "JOB_POSTING", text: "Tuyển 3 nhân viên tư vấn tuyển sinh (Sales Executive)", daysAgo: 11, path: "jobs/sunrise-sales" },
        { type: "WEBSITE_SCAN", text: "Website scan: url=https://sunrise-edu-demo.vn; status=200; quality_score=46; mobile_friendly=yes; https=yes; load_time_s=4.9; online_booking=no; ecommerce=no; last_updated=2022", daysAgo: 28, path: "scan/sunrise" },
        { type: "SOCIAL_PRESENCE", text: socialScan(true, false, true, 18000, 22, "TikTok"), daysAgo: 28, path: "social/sunrise" },
      ],
    }),
  ];
}

// ---------- procedural companies ----------
type Archetype = "hot" | "growing" | "steady" | "dormant";

function generateCompany(industry: Industry, usedNames: Set<string>): CompanySpec {
  const cfg = CFG[industry];
  let short = "";
  let kind = cfg.kinds[0];
  for (let i = 0; i < 50; i++) {
    kind = pick(cfg.kinds);
    short = fill(kind[0], { W: pick(BRAND_WORDS) });
    if (!usedNames.has(fold(short))) break;
  }
  usedNames.add(fold(short));
  const province = weighted(cfg.provinces);
  const p = PROVINCES[province];
  const district = pick(p.districts);
  const otherDistrict = pick(p.districts.filter((d) => d !== district));
  const size = weighted(cfg.sizes);
  const household = (cfg.householdShare ?? 0) > 0 && size === "1-10" && chance(0.7);
  const jsc = !household && (size === "201-500" || size === "500+" ? chance(0.7) : chance(0.2));
  const legal = household ? "Household business (Ho kinh doanh)" : jsc ? "JSC (Cong ty Co phan)" : "LLC (Cong ty TNHH)";
  const brandCore = short.replace(/^(Nhà hàng|Phở|Bếp|Lẩu|Bánh mì|Cơm Niêu|Nội thất|Thời trang|Điện máy|Mẹ & Bé|Mỹ phẩm|Đồng hồ|Cơ khí|Bao bì|Dệt may|Gỗ|Thực phẩm|Điện tử|Vận tải|Kho vận|Bất động sản|Địa ốc|Anh ngữ|Trung tâm Tin học|Mầm non|Kỹ năng sống|Nha khoa|Phòng khám Đa khoa|Phòng khám|Mắt|Xây dựng|Kiến trúc|Cơ điện|Nội thất xây dựng|Khách sạn|Kế toán|Luật|Tư vấn|Kiểm toán|Tóc|Nail|Hair Salon)\s+/, "");
  const company_name = household
    ? `Hộ kinh doanh ${short}`
    : `${jsc ? "Công ty Cổ phần" : "Công ty TNHH"} ${cfg.legalWord} ${brandCore}${chance(0.25) ? " Việt Nam" : ""}`;

  const r = rnd();
  const websiteState: "none" | "weak" | "ok" = r < cfg.noWebsite + (household ? 0.25 : 0) ? "none" : r < cfg.noWebsite + cfg.weakWebsite ? "weak" : "ok";
  const tld = pick([".vn", ".com.vn", ".com", ".vn"]);
  const website = websiteState === "none" ? null : `https://${slug(brandCore)}${industry === "Technology" ? "tech" : ""}${tld}`;
  const quality = websiteState === "weak" ? int(18, 49) : websiteState === "ok" ? int(52, 92) : null;

  // Beauty salons in HCMC never get the "hot" archetype so the scripted demo scenario stays reproducible.
  const archetype: Archetype =
    industry === "Beauty / Salon" && province === "Ho Chi Minh City"
      ? weighted([["growing", 30], ["steady", 35], ["dormant", 35]])
      : weighted([["hot", 17], ["growing", 33], ["steady", 28], ["dormant", 22]]);

  const days = (lo: number, hi: number) => int(lo, hi);
  const window: Record<Archetype, [number, number]> = { hot: [1, 28], growing: [3, 60], steady: [15, 120], dormant: [60, 170] };
  const [lo, hi] = window[archetype];
  const obs: ObsSpec[] = [];
  const v = { S: short, D: otherDistrict, P: province, K: "", n: 0 } as Record<string, string | number>;
  let jobN = 0;
  const job = (tpl: string, n: number) => {
    jobN++;
    obs.push({ type: "JOB_POSTING", text: fill(tpl, { ...v, n }), daysAgo: days(lo, hi), path: `jobs/${slug(short)}-${jobN}` });
  };
  const news = (tpl: string, d = days(lo, hi)) => {
    const k = int(2, 5);
    obs.push({ type: "NEWS", text: fill(tpl, { ...v, K: tpl.includes("thứ {K}") ? ORD_VI[k] : ORD[k] }), daysAgo: d, path: `news/${slug(short)}-${obs.length}` });
  };

  if (archetype === "hot") {
    if (chance(0.7)) job(pick(SALES_JOBS), int(2, 8));
    if (chance(0.6)) job(pick(MARKETING_JOBS), int(1, 3));
    if (chance(0.5)) job(pick(cfg.opsJobs), int(3, 15));
    if (chance(0.55)) news(pick(cfg.branchNews));
    if (chance(0.45)) news(pick(cfg.expansionNews));
    if (chance(0.25)) news(pick(cfg.productNews));
    if (industry === "Technology" && chance(0.6)) job(pick(TECH_JOBS), int(3, 12));
  } else if (archetype === "growing") {
    const roll = rnd();
    if (roll < 0.35) job(pick(SALES_JOBS), int(1, 4));
    else if (roll < 0.6) job(pick(MARKETING_JOBS), int(1, 2));
    if (chance(0.5)) job(pick(cfg.opsJobs), int(1, 6));
    if (chance(0.3)) news(pick(cfg.branchNews));
    else if (chance(0.3)) news(pick(cfg.expansionNews));
    if (chance(0.3)) news(pick(cfg.productNews));
    if (industry === "Technology" && chance(0.5)) job(pick(TECH_JOBS), int(1, 5));
  } else if (archetype === "steady") {
    if (chance(0.45)) job(pick(cfg.opsJobs), int(1, 3));
    if (chance(0.4)) news(pick(GENERIC_NEWS));
    if (chance(0.12)) news(pick(cfg.productNews));
  } else {
    if (chance(0.25)) news(pick(GENERIC_NEWS));
  }

  const scanDays = int(10, 90);
  obs.push({
    type: "WEBSITE_SCAN",
    text: websiteScan(website, quality, {
      booking: cfg.bookingRelevant && websiteState === "ok" && chance(0.5),
      ecommerce: industry === "Retail" && websiteState === "ok" && chance(0.5),
    }),
    daysAgo: scanDays,
    path: `scan/${slug(short)}`,
  });

  const fb = chance(websiteState === "none" ? 0.55 : 0.85);
  const li = ["Technology", "Manufacturing", "Logistics", "Professional Services", "Construction"].includes(industry) ? chance(0.6) : chance(0.15);
  const gb = chance(websiteState === "ok" ? 0.7 : 0.35);
  const growth = archetype === "hot" ? int(5, 60) : archetype === "growing" ? int(0, 35) : int(0, 12);
  const followers = fb ? (chance(0.2) ? int(80, 480) : int(600, 45000)) : 0;
  const newCh = archetype !== "dormant" && chance(0.15) ? pick(["TikTok", "Shopee Mall", "Zalo OA", "Lazada", "TikTok Shop"]) : "none";
  obs.push({ type: "SOCIAL_PRESENCE", text: socialScan(fb, li, gb, followers, growth, newCh), daysAgo: scanDays, path: `social/${slug(short)}` });

  const streets = STREETS[province];
  const year = industry === "Beauty / Salon" || industry === "Restaurant" ? int(2012, 2024) : int(1996, 2022);
  return {
    company_name,
    short_name: short,
    industry,
    description: kind[1],
    province,
    district,
    address: `${int(1, 450)} ${pick(streets)}, ${district}, ${province}`,
    website,
    employee_range: size,
    legal_entity_type: legal,
    founded: `${year}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
    tax_code: taxCode(province),
    observations: obs,
  };
}

// ---------- seed entry point ----------
export interface SeedOptions {
  now?: Date;
  generated?: number;
}

export function seedDatabase(db: Database.Database, opts: SeedOptions = {}) {
  rnd = mulberry32(20261006);
  usedTax.clear();
  const now = opts.now ?? new Date();
  const target = opts.generated ?? 330;
  const t0 = Date.now();

  db.transaction(() => {
    // Users
    const hash = (p: string) => bcrypt.hashSync(p, 10);
    db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)").run("demo@salesintel.vn", "Demo Sales Rep", hash("demo1234"), "user");
    db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)").run("admin@salesintel.vn", "Demo Admin", hash("admin1234"), "admin");

    // Data sources (only the demo dataset + manual/CSV are active; real public sources await legal review)
    const ds = db.prepare(
      `INSERT INTO data_sources (source_name, source_type, base_url, description, is_active, legal_review_status, robots_review_status, rate_limit_per_minute, last_crawled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const demoSource = Number(
      ds.run("SalesIntel Demo Dataset", "DEMO", DEMO_BASE, "Synthetic sample companies, job postings, news and website scans generated for this MVP. Not real businesses.", 1, "NOT_REQUIRED", "NOT_APPLICABLE", null, now.toISOString()).lastInsertRowid,
    );
    ds.run("Admin manual entry", "MANUAL", null, "Signals and companies entered by administrators in the Admin area.", 1, "NOT_REQUIRED", "NOT_APPLICABLE", null, null);
    ds.run("CSV import", "CSV_IMPORT", null, "Company lists uploaded by administrators (customer-owned data).", 1, "NOT_REQUIRED", "NOT_APPLICABLE", null, null);
    ds.run("National Business Registration Portal", "REGISTRY", "https://dangkykinhdoanh.gov.vn", "Public company registration information (name, tax code, address, status). Terms of use must be reviewed; no CAPTCHA bypass or automated bulk download.", 0, "PENDING", "PENDING", 10, null);
    ds.run("Public job boards", "JOB_BOARD", null, "Public job postings (company-level hiring signals only, no candidate data). Each board requires a separate ToS / robots.txt review or an official API/feed.", 0, "PENDING", "PENDING", 6, null);
    ds.run("Public news RSS feeds", "NEWS", null, "Business news via publisher RSS feeds (headlines + links only; full text stays on publisher site).", 0, "PENDING", "ALLOWED", 30, null);
    ds.run("Company websites (homepage scan)", "WEBSITE", null, "Homepage-only technical scan (status, HTTPS, mobile, speed). Respects robots.txt, identifies its user agent, max 1 request / domain / day.", 0, "APPROVED", "PENDING", 60, null);

    const specs = [...heroCompanies()];
    const usedNames = new Set(specs.map((s) => fold(s.short_name)));
    const industries = Object.keys(CFG) as Industry[];
    const weights: Partial<Record<Industry, number>> = { "Beauty / Salon": 1.4, Restaurant: 1.2, Retail: 1.2, Manufacturing: 1.2 };
    while (specs.length < target) {
      specs.push(generateCompany(weighted(industries.map((i) => [i, weights[i] ?? 1] as [Industry, number])), usedNames));
    }

    const obsInsert = db.prepare(
      "INSERT INTO raw_observations (company_id, source_id, source_url, observation_type, title, raw_text, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const lastUpdated = db.prepare("UPDATE companies SET last_updated_at = ?, created_at = ? WHERE id = ?");
    for (const s of specs) {
      const id = insertCompany(db, {
        company_name: s.company_name,
        short_name: s.short_name,
        tax_code: s.tax_code,
        industry: s.industry,
        business_description: s.description,
        province: s.province,
        district: s.district,
        address: s.address,
        website: s.website,
        founded_date: s.founded,
        estimated_employee_range: s.employee_range,
        legal_entity_type: s.legal_entity_type,
        company_status: chance(0.02) ? "Temporarily suspended" : "Active",
        public_source_url: `${DEMO_BASE}/registry/${s.tax_code}`,
        is_demo: 1,
      });
      let newest = 400;
      for (const o of s.observations) {
        const at = new Date(now.getTime() - o.daysAgo * 86400000 - int(0, 36000) * 1000).toISOString();
        newest = Math.min(newest, o.daysAgo);
        obsInsert.run(id, demoSource, `${DEMO_BASE}/${o.path}`, o.type, null, o.text, at);
      }
      const upd = new Date(now.getTime() - Math.max(0, newest - int(0, 3)) * 86400000).toISOString().replace("T", " ").slice(0, 19);
      lastUpdated.run(upd, upd, id);
    }

    processPendingObservations(db);
    const ids = db.prepare("SELECT id FROM companies").all() as { id: number }[];
    for (const { id } of ids) recomputeCompany(db, id, now);

    // Demo lead lists
    const demoUser = (db.prepare("SELECT id FROM users WHERE email = 'demo@salesintel.vn'").get() as { id: number }).id;
    const adminUser = (db.prepare("SELECT id FROM users WHERE email = 'admin@salesintel.vn'").get() as { id: number }).id;
    const mkList = db.prepare("INSERT INTO saved_lists (user_id, name, description) VALUES (?, ?, ?)");
    const addTo = db.prepare("INSERT OR IGNORE INTO saved_companies (list_id, company_id, note) VALUES (?, ?, ?)");
    const lists: [string, string, string][] = [
      ["Website prospects", "Companies with no or weak website and active growth signals",
        `SELECT c.id FROM companies c JOIN company_digital_profiles p ON p.company_id = c.id
         WHERE (p.website_exists = 0 OR p.website_quality_score < 50) ORDER BY c.ai_opportunity_score DESC LIMIT 8`],
      ["Salon leads", "Beauty & salon businesses in HCMC", `SELECT id FROM companies WHERE industry = 'Beauty / Salon' AND province = 'Ho Chi Minh City' ORDER BY ai_opportunity_score DESC LIMIT 6`],
      ["Manufacturing prospects", "Manufacturers that are expanding or hiring", `SELECT id FROM companies WHERE industry = 'Manufacturing' AND (expansion_signal = 1 OR hiring_signal = 1) ORDER BY ai_opportunity_score DESC LIMIT 6`],
      ["High priority October", "Top accounts to contact this month", `SELECT id FROM companies ORDER BY ai_opportunity_score DESC, latest_signal_date DESC LIMIT 5`],
    ];
    for (const user of [demoUser, adminUser]) {
      for (const [n, d, q] of lists) {
        const listId = Number(mkList.run(user, n, d).lastInsertRowid);
        for (const { id } of db.prepare(q).all() as { id: number }[]) addTo.run(listId, id, null);
      }
    }
  })();

  const { n } = db.prepare("SELECT COUNT(*) n FROM companies").get() as { n: number };
  console.log(`[seed] Seeded ${n} demo companies in ${Date.now() - t0} ms`);
}
