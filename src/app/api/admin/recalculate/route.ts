import { NextResponse } from "next/server";
import { analyzeCompanyWithAI, recomputeCompany } from "@/lib/analysis";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { processPendingObservations } from "@/lib/signals";

// POST {}                    -> process pending observations + recalculate ALL scores (rules engine)
// POST { companyId, ai:true } -> recalculate one company and regenerate its narrative with AI
export async function POST(req: Request) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  if (body.companyId) {
    if (body.ai) {
      const r = await analyzeCompanyWithAI(db, Number(body.companyId));
      if (!r) return NextResponse.json({ error: "Company not found" }, { status: 404 });
      return NextResponse.json({ score: r.score, generated_by: r.analysis.generated_by });
    }
    const score = recomputeCompany(db, Number(body.companyId));
    if (!score) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    return NextResponse.json({ score });
  }
  const t0 = Date.now();
  const before = db.prepare("SELECT id, ai_opportunity_score s FROM companies").all() as { id: number; s: number }[];
  const pending = db.transaction(() => {
    const p = processPendingObservations(db);
    for (const { id } of before) recomputeCompany(db, id);
    return p;
  })();
  const after = new Map((db.prepare("SELECT id, ai_opportunity_score s FROM companies").all() as { id: number; s: number }[]).map((r) => [r.id, r.s]));
  const changed = before.filter((b) => after.get(b.id) !== b.s).length;
  return NextResponse.json({ companies: before.length, changed, processedObservations: pending.observations, newSignals: pending.signals, ms: Date.now() - t0 });
}
