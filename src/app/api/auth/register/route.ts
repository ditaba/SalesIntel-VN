import { NextResponse } from "next/server";
import { createUser, startSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  if (getDb().prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  const user = createUser(email, name, password);
  await startSession(user);
  return NextResponse.json({ user }, { status: 201 });
}
