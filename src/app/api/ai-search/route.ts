import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { savedCompanyIds } from "@/lib/lists";
import { runNLSearch } from "@/lib/nlsearch";
import { filtersToParams } from "@/lib/search";

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim().slice(0, 500);
  if (!question) return NextResponse.json({ error: "Please type a question" }, { status: 400 });
  const db = getDb();
  const r = await runNLSearch(db, question);
  const saved = savedCompanyIds(db, user.id);
  return NextResponse.json({
    question: r.question,
    answer: r.answer,
    interpretation: r.parsed.interpretation,
    parser: r.parsed.parser,
    relaxed: r.relaxed,
    total: r.total,
    filtersQuery: filtersToParams(r.parsed.filters).toString(),
    rows: r.rows,
    savedIds: r.rows.filter((x) => saved.has(x.id)).map((x) => x.id),
  });
}
