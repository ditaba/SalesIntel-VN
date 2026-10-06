import { NextResponse } from "next/server";
import { recomputeCompany } from "@/lib/analysis";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { validateSignal } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const db = getDb();
  const id = Number((await params).id);
  const existing = db.prepare("SELECT * FROM business_signals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  const { errors, value } = validateSignal({ ...existing, ...(await req.json().catch(() => ({}))) });
  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  db.prepare("UPDATE business_signals SET signal_type = ?, signal_strength = ?, description = ?, source_url = ?, quantity = ?, detected_at = ? WHERE id = ?").run(
    value.signal_type, value.signal_strength, value.description, value.source_url, value.quantity, value.detected_at, id,
  );
  const score = recomputeCompany(db, Number(existing.company_id));
  return NextResponse.json({ ok: true, score });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const db = getDb();
  const id = Number((await params).id);
  const existing = db.prepare("SELECT company_id FROM business_signals WHERE id = ?").get(id) as { company_id: number } | undefined;
  if (!existing) return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  db.prepare("DELETE FROM business_signals WHERE id = ?").run(id);
  const score = recomputeCompany(db, existing.company_id);
  return NextResponse.json({ ok: true, score });
}
