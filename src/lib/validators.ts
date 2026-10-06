import { SIGNAL_TYPE_KEYS } from "./constants";

export function validateSignal(body: Record<string, unknown>) {
  const errors: string[] = [];
  const signal_type = String(body.signal_type ?? "");
  if (!SIGNAL_TYPE_KEYS.includes(signal_type as never)) errors.push("Invalid signal_type");
  const signal_strength = String(body.signal_strength ?? "MEDIUM");
  if (!["HIGH", "MEDIUM", "LOW"].includes(signal_strength)) errors.push("Invalid signal_strength");
  const description = String(body.description ?? "").trim();
  if (!description) errors.push("Description is required");
  const detected_at = body.detected_at ? new Date(String(body.detected_at)) : new Date();
  if (Number.isNaN(detected_at.getTime())) errors.push("Invalid detected_at date");
  const source_url = body.source_url ? String(body.source_url).trim() : null;
  if (source_url && !/^https?:\/\//.test(source_url)) errors.push("source_url must start with http(s)://");
  const quantity = body.quantity ? Number(body.quantity) : null;
  return { errors, value: { signal_type, signal_strength, description, detected_at: detected_at.toISOString(), source_url, quantity } };
}

export const SOURCE_TYPES = ["DEMO", "REGISTRY", "JOB_BOARD", "NEWS", "WEBSITE", "MANUAL", "CSV_IMPORT", "OPEN_DATA"];

export function validateSource(b: Record<string, unknown>) {
  const errors: string[] = [];
  const source_name = String(b.source_name ?? "").trim();
  if (!source_name) errors.push("source_name is required");
  const source_type = String(b.source_type ?? "");
  if (!SOURCE_TYPES.includes(source_type)) errors.push(`source_type must be one of ${SOURCE_TYPES.join(", ")}`);
  const base_url = b.base_url ? String(b.base_url).trim() : null;
  if (base_url && !/^https?:\/\//.test(base_url)) errors.push("base_url must start with http(s)://");
  const legal = String(b.legal_review_status ?? "PENDING");
  if (!["PENDING", "APPROVED", "REJECTED", "NOT_REQUIRED"].includes(legal)) errors.push("Invalid legal_review_status");
  const robots = String(b.robots_review_status ?? "PENDING");
  if (!["PENDING", "ALLOWED", "DISALLOWED", "NOT_APPLICABLE"].includes(robots)) errors.push("Invalid robots_review_status");
  const is_active = b.is_active ? 1 : 0;
  // Compliance guard: a source can only be activated after legal approval and a robots.txt review that allows it.
  if (is_active && !["APPROVED", "NOT_REQUIRED"].includes(legal)) errors.push("Cannot activate a source before legal review is APPROVED");
  if (is_active && ["PENDING", "DISALLOWED"].includes(robots)) errors.push("Cannot activate a source whose robots.txt review is PENDING or DISALLOWED");
  return {
    errors,
    value: { source_name, source_type, base_url, description: b.description ? String(b.description) : null, legal_review_status: legal, robots_review_status: robots, is_active, rate_limit_per_minute: b.rate_limit_per_minute ? Number(b.rate_limit_per_minute) : null },
  };
}

