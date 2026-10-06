import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { validateSource } from "@/lib/validators";

export async function POST(req: Request) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const { errors, value } = validateSource(await req.json().catch(() => ({})));
  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  try {
    const info = getDb()
      .prepare(
        `INSERT INTO data_sources (source_name, source_type, base_url, description, is_active, legal_review_status, robots_review_status, rate_limit_per_minute)
         VALUES (@source_name, @source_type, @base_url, @description, @is_active, @legal_review_status, @robots_review_status, @rate_limit_per_minute)`,
      )
      .run(value);
    return NextResponse.json({ id: Number(info.lastInsertRowid) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A source with this name already exists" }, { status: 409 });
  }
}
