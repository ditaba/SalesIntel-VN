import { NextResponse } from "next/server";
import { startSession, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  if (!email || !password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  const user = verifyPassword(email, password);
  if (!user) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  await startSession(user);
  return NextResponse.json({ user });
}
