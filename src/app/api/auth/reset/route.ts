import { NextResponse } from "next/server";
import { resetPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  if (!resetPassword(String(body.token ?? ""), password)) return NextResponse.json({ error: "Reset link is invalid or has expired" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
