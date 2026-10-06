import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { toCSV } from "@/lib/lists";
import { filtersFromParams, searchCompanies } from "@/lib/search";

export async function GET(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const f = { ...filtersFromParams(sp), page: 1, pageSize: 100 };
  // Export is capped at 500 rows for the MVP.
  const db = getDb();
  const all: Record<string, unknown>[] = [];
  for (let p = 1; p <= 5; p++) {
    const { rows, total } = searchCompanies(db, { ...f, page: p });
    all.push(...(rows as unknown as Record<string, unknown>[]));
    if (p * 100 >= total) break;
  }
  return new NextResponse(toCSV(all), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="companies.csv"' } });
}
