import type Database from "better-sqlite3";

export function savedCompanyIds(db: Database.Database, userId: number): Set<number> {
  const rows = db
    .prepare("SELECT DISTINCT sc.company_id id FROM saved_companies sc JOIN saved_lists l ON l.id = sc.list_id WHERE l.user_id = ?")
    .all(userId) as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

export interface ListSummary {
  id: number;
  name: string;
  description: string | null;
  count: number;
  avg_score: number | null;
  high: number;
  updated_at: string;
}

export function userLists(db: Database.Database, userId: number): ListSummary[] {
  return db
    .prepare(
      `SELECT l.id, l.name, l.description, l.updated_at, COUNT(sc.id) count, ROUND(AVG(c.ai_opportunity_score)) avg_score,
              SUM(CASE WHEN c.ai_opportunity_level = 'HIGH' THEN 1 ELSE 0 END) high
       FROM saved_lists l LEFT JOIN saved_companies sc ON sc.list_id = l.id LEFT JOIN companies c ON c.id = sc.company_id
       WHERE l.user_id = ? GROUP BY l.id ORDER BY l.created_at, l.id`,
    )
    .all(userId) as ListSummary[];
}

export function ownedList(db: Database.Database, userId: number, listId: number) {
  return db.prepare("SELECT * FROM saved_lists WHERE id = ? AND user_id = ?").get(listId, userId) as
    | { id: number; name: string; description: string | null; user_id: number }
    | undefined;
}

export function listMembership(db: Database.Database, userId: number, companyId: number) {
  return db
    .prepare(
      `SELECT l.id, l.name, (SELECT COUNT(*) FROM saved_companies x WHERE x.list_id = l.id) count,
              EXISTS (SELECT 1 FROM saved_companies sc WHERE sc.list_id = l.id AND sc.company_id = ?) has
       FROM saved_lists l WHERE l.user_id = ? ORDER BY l.created_at, l.id`,
    )
    .all(companyId, userId)
    .map((r) => ({ ...(r as object), has: Boolean((r as { has: number }).has) }));
}

export function addToList(db: Database.Database, listId: number, companyId: number, note?: string | null) {
  db.prepare("INSERT OR IGNORE INTO saved_companies (list_id, company_id, note) VALUES (?, ?, ?)").run(listId, companyId, note ?? null);
  db.prepare("UPDATE saved_lists SET updated_at = datetime('now') WHERE id = ?").run(listId);
}

export function removeFromList(db: Database.Database, listId: number, companyId: number) {
  db.prepare("DELETE FROM saved_companies WHERE list_id = ? AND company_id = ?").run(listId, companyId);
  db.prepare("UPDATE saved_lists SET updated_at = datetime('now') WHERE id = ?").run(listId);
}

export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const EXPORT_COLUMNS = [
  "company_name", "short_name", "tax_code", "industry", "province", "district", "address", "website", "estimated_employee_range",
  "ai_opportunity_score", "ai_opportunity_level", "latest_signal_date", "ai_why_now", "ai_recommended_services", "public_source_url",
] as const;

export function toCSV(rows: Record<string, unknown>[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      EXPORT_COLUMNS.map((k) => {
        let v = r[k];
        if (k === "ai_recommended_services" && typeof v === "string") {
          try {
            v = (JSON.parse(v) as string[]).join("; ");
          } catch {}
        }
        return csvEscape(v);
      }).join(","),
    );
  }
  return "﻿" + lines.join("\r\n");
}
