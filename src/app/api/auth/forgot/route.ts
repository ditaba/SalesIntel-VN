import { NextResponse } from "next/server";
import { createPasswordReset } from "@/lib/auth";

// MVP: no email provider is configured, so in demo mode the reset link is returned directly.
// In production set EMAIL delivery and remove `resetUrl` from the response.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "");
  const token = email ? createPasswordReset(email) : null;
  const demo = process.env.DEMO_RESET_LINKS !== "0";
  return NextResponse.json({
    ok: true,
    message: "If an account exists for this email, a reset link has been created.",
    resetUrl: demo && token ? `/reset-password?token=${token}` : undefined,
  });
}
