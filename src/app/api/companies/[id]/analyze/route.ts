import { NextResponse } from "next/server";
import { analyzeCompanyWithAI } from "@/lib/analysis";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Recomputes signal flags + deterministic score, then (re)writes the narrative with Claude when configured,
// otherwise with the rules engine. Available to all signed-in users (the score itself never changes from AI).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const result = await analyzeCompanyWithAI(getDb(), Number((await params).id));
  if (!result) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  return NextResponse.json({ score: result.score, generated_by: result.analysis.generated_by, analysis: result.analysis });
}
