import { NextResponse } from "next/server";
import { recomputeCompany } from "@/lib/analysis";
import { apiUser } from "@/lib/auth";
import { findDuplicate, insertCompany, validateCompanyInput } from "@/lib/companies";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const { value, errors } = validateCompanyInput(await req.json().catch(() => ({})));
  if (errors.length) return NextResponse.json({ error: errors.join("; "), errors }, { status: 400 });
  const db = getDb();
  const dup = findDuplicate(db, value);
  if (dup) return NextResponse.json({ error: `Duplicate of existing company "${dup.company_name}" (#${dup.id})` }, { status: 409 });
  const id = insertCompany(db, { ...value, is_demo: 0 });
  recomputeCompany(db, id);
  return NextResponse.json({ id }, { status: 201 });
}
