import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { addToList, ownedList, removeFromList } from "@/lib/lists";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const db = getDb();
  const list = ownedList(db, user.id, Number((await params).id));
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const companyId = Number(body.companyId);
  if (!db.prepare("SELECT 1 FROM companies WHERE id = ?").get(companyId)) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  addToList(db, list.id, companyId, body.note ? String(body.note).slice(0, 500) : null);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const db = getDb();
  const list = ownedList(db, user.id, Number((await params).id));
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  removeFromList(db, list.id, Number(new URL(req.url).searchParams.get("companyId")));
  return NextResponse.json({ ok: true });
}
