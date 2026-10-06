export interface CompanyRow {
  id: number;
  tax_code: string | null;
  company_name: string;
  short_name: string | null;
  industry: string;
  business_description: string | null;
  province: string;
  district: string | null;
  address: string | null;
  website: string | null;
  company_status: string;
  founded_date: string | null;
  estimated_employee_range: string | null;
  employee_range_order: number;
  legal_entity_type: string | null;
  public_source_url: string | null;
  is_demo: number;
  hiring_signal: number;
  hiring_count: number;
  marketing_hiring_signal: number;
  sales_hiring_signal: number;
  technology_hiring_signal: number;
  new_branch_signal: number;
  expansion_signal: number;
  recent_news_signal: number;
  website_problem_signal: number;
  digital_presence_signal: "STRONG" | "NEUTRAL" | "WEAK";
  latest_signal_date: string | null;
  ai_company_summary: string | null;
  ai_opportunity_score: number;
  ai_opportunity_level: "HIGH" | "MEDIUM" | "LOW";
  ai_sales_reasons: string | null;
  ai_recommended_services: string | null;
  ai_recommended_sales_pitch: string | null;
  ai_why_now: string | null;
  ai_facts: string | null;
  ai_inferences: string | null;
  ai_generated_by: string | null;
  ai_generated_at: string | null;
  created_at: string;
  last_updated_at: string;
}

export interface DigitalProfile {
  company_id: number;
  website_exists: number;
  website_quality_score: number | null;
  website_mobile_friendly: number | null;
  website_https: number | null;
  website_last_updated_year: number | null;
  facebook_page_exists: number;
  linkedin_company_page_exists: number;
  ecommerce_presence: number;
  online_booking_available: number;
  google_business_profile: number;
  last_checked_at: string | null;
}

/** Company row joined with its digital profile, as returned by search. */
export type CompanyListRow = CompanyRow & {
  website_exists: number | null;
  website_quality_score: number | null;
};

export interface SignalRow {
  id: number;
  company_id: number;
  observation_id: number | null;
  source_id: number | null;
  signal_type: string;
  signal_strength: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  source_url: string | null;
  quantity: number | null;
  detected_at: string;
  created_by: string;
  source_name?: string | null;
}

export interface DataSourceRow {
  id: number;
  source_name: string;
  source_type: string;
  base_url: string | null;
  description: string | null;
  is_active: number;
  legal_review_status: string;
  robots_review_status: string;
  rate_limit_per_minute: number | null;
  last_crawled_at: string | null;
}

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
}
