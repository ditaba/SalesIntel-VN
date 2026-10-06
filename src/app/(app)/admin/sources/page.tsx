import { SourcesManager } from "@/components/admin";
import { getDb } from "@/lib/db";
import type { DataSourceRow } from "@/lib/types";

export const metadata = { title: "Admin · Data Sources" };

export default function SourcesPage() {
  const db = getDb();
  const sources = db.prepare("SELECT * FROM data_sources ORDER BY is_active DESC, id").all() as DataSourceRow[];
  const counts = Object.fromEntries((db.prepare("SELECT source_id, COUNT(*) n FROM raw_observations GROUP BY source_id").all() as { source_id: number; n: number }[]).map((r) => [r.source_id, r.n]));
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Compliance policy</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Company-level public business information only — no personal phone numbers, personal emails or private profiles.</li>
          <li>A source can be activated only after legal review is <b>APPROVED</b> and its robots.txt review is <b>ALLOWED</b> (enforced by the API).</li>
          <li>Crawlers must never bypass authentication, CAPTCHA, access controls or rate limits; every record keeps its source URL.</li>
          <li>In this MVP only the synthetic demo dataset, manual entry and CSV import are active — no external sites are crawled.</li>
        </ul>
      </div>
      <SourcesManager sources={sources} counts={counts} />
    </div>
  );
}
