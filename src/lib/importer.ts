// CSV company import: parse -> validate -> normalise -> de-duplicate -> insert -> score.

import type Database from "better-sqlite3";
import { recomputeCompany } from "./analysis";
import { dedupeKey, findDuplicate, insertCompany, validateCompanyInput } from "./companies";

/** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export const IMPORT_COLUMNS = ["company_name", "tax_code", "industry", "province", "address", "website", "employee_range"] as const;
const OPTIONAL_COLUMNS = ["short_name", "district", "business_description", "founded_date", "legal_entity_type", "public_source_url"];
const HEADER_ALIASES: Record<string, string> = {
  name: "company_name", company: "company_name", ten_cong_ty: "company_name", mst: "tax_code", taxcode: "tax_code", tax_id: "tax_code",
  employees: "employee_range", estimated_employee_range: "employee_range", size: "employee_range", city: "province", tinh: "province",
  url: "website", web: "website", description: "business_description", district_name: "district",
};

export interface ImportReport {
  dryRun: boolean;
  totalRows: number;
  inserted: { row: number; id?: number; company_name: string; score?: number; level?: string }[];
  duplicates: { row: number; company_name: string; reason: string }[];
  invalid: { row: number; company_name: string; errors: string[] }[];
  missingColumns: string[];
  unknownColumns: string[];
  normalized: { row: number; field: string; from: string; to: string }[];
}

export function importCompaniesCSV(db: Database.Database, csvText: string, opts: { dryRun?: boolean; sourceId?: number | null } = {}): ImportReport {
  const report: ImportReport = { dryRun: !!opts.dryRun, totalRows: 0, inserted: [], duplicates: [], invalid: [], missingColumns: [], unknownColumns: [], normalized: [] };
  const rows = parseCSV(csvText);
  if (rows.length === 0) {
    report.missingColumns = [...IMPORT_COLUMNS];
    return report;
  }
  const header = rows[0].map((h) => {
    const k = h.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return HEADER_ALIASES[k] ?? k;
  });
  report.missingColumns = ["company_name", "industry", "province"].filter((c) => !header.includes(c));
  report.unknownColumns = header.filter((h) => !(IMPORT_COLUMNS as readonly string[]).includes(h) && !OPTIONAL_COLUMNS.includes(h));
  if (report.missingColumns.length) return report;

  const seen = new Map<string, number>();
  const toInsert: { row: number; value: ReturnType<typeof validateCompanyInput>["value"] }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const rowNo = i + 1; // 1-based incl. header, matches spreadsheet row numbers
    report.totalRows++;
    const raw: Record<string, string> = {};
    header.forEach((h, j) => (raw[h] = (rows[i][j] ?? "").trim()));
    const { value, errors } = validateCompanyInput(raw);
    if (errors.length) {
      report.invalid.push({ row: rowNo, company_name: raw.company_name || "(empty)", errors });
      continue;
    }
    for (const field of ["industry", "province", "website", "employee_range"] as const) {
      const from = raw[field] ?? "";
      const to = String((field === "employee_range" ? value.estimated_employee_range : value[field]) ?? "");
      if (from && to && from !== to) report.normalized.push({ row: rowNo, field, from, to });
    }
    const keys = [value.tax_code ? `tax:${value.tax_code}` : null, `name:${dedupeKey(value.company_name, value.province)}`].filter(Boolean) as string[];
    const dupInFile = keys.map((k) => seen.get(k)).find((r) => r != null);
    if (dupInFile != null) {
      report.duplicates.push({ row: rowNo, company_name: value.company_name, reason: `Duplicate of row ${dupInFile} in this file` });
      continue;
    }
    const existing = findDuplicate(db, value);
    if (existing) {
      report.duplicates.push({ row: rowNo, company_name: value.company_name, reason: `Already in database as "${existing.company_name}" (#${existing.id})` });
      continue;
    }
    keys.forEach((k) => seen.set(k, rowNo));
    toInsert.push({ row: rowNo, value });
  }

  if (opts.dryRun) {
    report.inserted = toInsert.map((t) => ({ row: t.row, company_name: t.value.company_name }));
    return report;
  }

  db.transaction(() => {
    for (const t of toInsert) {
      const id = insertCompany(db, { ...t.value, is_demo: 0 });
      if (opts.sourceId) db.prepare("UPDATE companies SET public_source_url = COALESCE(public_source_url, ?) WHERE id = ?").run(`import://csv/${new Date().toISOString().slice(0, 10)}`, id);
      const score = recomputeCompany(db, id);
      report.inserted.push({ row: t.row, id, company_name: t.value.company_name, score: score?.score, level: score?.level });
    }
    if (opts.sourceId) db.prepare("UPDATE data_sources SET last_crawled_at = ? WHERE id = ?").run(new Date().toISOString(), opts.sourceId);
  })();
  return report;
}
