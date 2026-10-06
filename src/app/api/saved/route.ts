import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listMembership } from "@/lib/lists";

export async function GET(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const companyId = Number(new URL(req.url).searchParams.get("companyId"));
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  return NextResponse.json({ lists: listMembership(getDb(), user.id, companyId) });
}
