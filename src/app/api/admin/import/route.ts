import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { importCompaniesCSV } from "@/lib/importer";

const MAX_BYTES = 2 * 1024 * 1024;

// Accepts multipart/form-data (field "file") or JSON { csv: "..." }. Add ?dryRun=1 to validate without inserting.
export async function POST(req: Request) {
  const user = await apiUser({ admin: true });
  if (user instanceof NextResponse) return user;
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  let text = "";
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 2 MB" }, { status: 413 });
    text = await file.text();
  } else {
    const body = await req.json().catch(() => ({}));
    text = String(body.csv ?? "");
  }
  if (!text.trim()) return NextResponse.json({ error: "CSV is empty" }, { status: 400 });
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "CSV is larger than 2 MB" }, { status: 413 });
  const db = getDb();
  const source = db.prepare("SELECT id FROM data_sources WHERE source_type = 'CSV_IMPORT'").get() as { id: number } | undefined;
  const report = importCompaniesCSV(db, text, { dryRun, sourceId: source?.id ?? null });
  if (report.missingColumns.length) return NextResponse.json({ error: `Missing required column(s): ${report.missingColumns.join(", ")}`, report }, { status: 400 });
  return NextResponse.json({ report });
}
