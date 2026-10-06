import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { validateSource } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const db = getDb();
  const id = Number((await params).id);
  const existing = db.prepare("SELECT * FROM data_sources WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "Source not found" }, { status: 404 });
  const { errors, value } = validateSource({ ...existing, ...(await req.json().catch(() => ({}))) });
  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  db.prepare(
    `UPDATE data_sources SET source_name = @source_name, source_type = @source_type, base_url = @base_url, description = @description,
       is_active = @is_active, legal_review_status = @legal_review_status, robots_review_status = @robots_review_status,
       rate_limit_per_minute = @rate_limit_per_minute, updated_at = datetime('now') WHERE id = @id`,
  ).run({ ...value, id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const info = getDb().prepare("DELETE FROM data_sources WHERE id = ? AND source_type NOT IN ('DEMO','MANUAL','CSV_IMPORT')").run(Number((await params).id));
  if (!info.changes) return NextResponse.json({ error: "Source not found or is a built-in source" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
