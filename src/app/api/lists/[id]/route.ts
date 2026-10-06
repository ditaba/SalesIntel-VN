import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ownedList } from "@/lib/lists";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const db = getDb();
  const list = ownedList(db, user.id, Number((await params).id));
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const name = body.name != null ? String(body.name).trim().slice(0, 80) : list.name;
  if (!name) return NextResponse.json({ error: "List name is required" }, { status: 400 });
  try {
    db.prepare("UPDATE saved_lists SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?").run(name, body.description ?? list.description, list.id);
  } catch {
    return NextResponse.json({ error: "You already have a list with this name" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const db = getDb();
  const list = ownedList(db, user.id, Number((await params).id));
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  db.prepare("DELETE FROM saved_lists WHERE id = ?").run(list.id);
  return NextResponse.json({ ok: true });
}
