import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ownedList, toCSV } from "@/lib/lists";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const db = getDb();
  const list = ownedList(db, user.id, Number((await params).id));
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  const rows = db.prepare("SELECT c.* FROM saved_companies sc JOIN companies c ON c.id = sc.company_id WHERE sc.list_id = ? ORDER BY c.ai_opportunity_score DESC").all(list.id) as Record<string, unknown>[];
  const file = list.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(toCSV(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"` } });
}
