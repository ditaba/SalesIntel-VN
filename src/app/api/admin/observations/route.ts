import { NextResponse } from "next/server";
import { recomputeCompany } from "@/lib/analysis";
import { apiUser } from "@/lib/auth";
import { OBSERVATION_TYPES } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { processObservation } from "@/lib/signals";

// Ingestion endpoint: the same entry point future crawlers will use.
// Inserts a RawObservation, runs the signal engine on it, then recomputes flags + score + analysis.
export async function POST(req: Request) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  const companyId = Number(body.company_id);
  if (!db.prepare("SELECT 1 FROM companies WHERE id = ?").get(companyId)) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  const type = String(body.observation_type ?? "");
  if (!OBSERVATION_TYPES.includes(type as never)) return NextResponse.json({ error: `observation_type must be one of ${OBSERVATION_TYPES.join(", ")}` }, { status: 400 });
  const text = String(body.raw_text ?? "").trim();
  if (!text) return NextResponse.json({ error: "raw_text is required" }, { status: 400 });
  const sourceUrl = body.source_url ? String(body.source_url).trim() : null;
  if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) return NextResponse.json({ error: "source_url must start with http(s)://" }, { status: 400 });
  const sourceId = body.source_id ? Number(body.source_id) : (db.prepare("SELECT id FROM data_sources WHERE source_type = 'MANUAL'").get() as { id: number } | undefined)?.id ?? null;
  const observedAt = body.observed_at ? new Date(String(body.observed_at)).toISOString() : new Date().toISOString();
  const obsId = Number(
    db.prepare("INSERT INTO raw_observations (company_id, source_id, source_url, observation_type, raw_text, observed_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(companyId, sourceId, sourceUrl, type, text, observedAt).lastInsertRowid,
  );
  const signals = processObservation(db, obsId);
  db.prepare("UPDATE companies SET last_updated_at = datetime('now') WHERE id = ?").run(companyId);
  const score = recomputeCompany(db, companyId);
  return NextResponse.json({ observation_id: obsId, signals, score }, { status: 201 });
}
