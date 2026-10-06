import { NextResponse } from "next/server";
import { recomputeCompany } from "@/lib/analysis";
import { apiUser } from "@/lib/auth";
import { findDuplicate, updateCompany, validateCompanyInput } from "@/lib/companies";
import { getDb } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM companies WHERE id = ?").get(id)) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  const { value, errors } = validateCompanyInput(await req.json().catch(() => ({})));
  if (errors.length) return NextResponse.json({ error: errors.join("; "), errors }, { status: 400 });
  const dup = findDuplicate(db, value, id);
  if (dup) return NextResponse.json({ error: `Duplicate of existing company "${dup.company_name}" (#${dup.id})` }, { status: 409 });
  updateCompany(db, id, value);
  const score = recomputeCompany(db, id);
  return NextResponse.json({ ok: true, score });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const info = getDb().prepare("DELETE FROM companies WHERE id = ?").run(Number((await params).id));
  if (!info.changes) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
