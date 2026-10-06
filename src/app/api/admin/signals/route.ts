import { NextResponse } from "next/server";
import { recomputeCompany } from "@/lib/analysis";
import { apiUser } from "@/lib/auth";
import { validateSignal } from "@/lib/validators";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  const companyId = Number(body.company_id);
  if (!db.prepare("SELECT 1 FROM companies WHERE id = ?").get(companyId)) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  const { errors, value } = validateSignal(body);
  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  const manual = db.prepare("SELECT id FROM data_sources WHERE source_type = 'MANUAL'").get() as { id: number } | undefined;
  const info = db
    .prepare(
      `INSERT INTO business_signals (company_id, source_id, signal_type, signal_strength, description, source_url, quantity, detected_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin')`,
    )
    .run(companyId, manual?.id ?? null, value.signal_type, value.signal_strength, value.description, value.source_url, value.quantity, value.detected_at);
  db.prepare("UPDATE companies SET last_updated_at = datetime('now') WHERE id = ?").run(companyId);
  const score = recomputeCompany(db, companyId);
  return NextResponse.json({ id: Number(info.lastInsertRowid), score }, { status: 201 });
}
