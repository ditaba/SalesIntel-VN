import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { llmEnabled } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  const { n } = getDb().prepare("SELECT COUNT(*) n FROM companies").get() as { n: number };
  return NextResponse.json({ ok: true, companies: n, ai: llmEnabled() ? "claude" : "rules-engine" });
}
