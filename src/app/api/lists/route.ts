import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { addToList, userLists } from "@/lib/lists";

export async function GET() {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ lists: userLists(getDb(), user.id) });
}

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "List name is required" }, { status: 400 });
  const db = getDb();
  if (db.prepare("SELECT 1 FROM saved_lists WHERE user_id = ? AND name = ?").get(user.id, name))
    return NextResponse.json({ error: "You already have a list with this name" }, { status: 409 });
  const id = Number(db.prepare("INSERT INTO saved_lists (user_id, name, description) VALUES (?, ?, ?)").run(user.id, name, body.description ? String(body.description).slice(0, 300) : null).lastInsertRowid);
  if (body.companyId && db.prepare("SELECT 1 FROM companies WHERE id = ?").get(Number(body.companyId))) addToList(db, id, Number(body.companyId));
  return NextResponse.json({ id, name }, { status: 201 });
}
