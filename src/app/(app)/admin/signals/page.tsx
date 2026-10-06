import { SignalCreateForm, SignalRowEditor } from "@/components/admin";
import { SectionCard } from "@/components/ui";
import { getDb } from "@/lib/db";
import type { SignalRow } from "@/lib/types";

export const metadata = { title: "Admin · Signals" };

export default async function AdminSignals({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  const db = getDb();
  const by = (await searchParams).by;
  const rows = db
    .prepare(
      `SELECT s.*, COALESCE(c.short_name, c.company_name) company_label FROM business_signals s JOIN companies c ON c.id = s.company_id
       ${by === "admin" ? "WHERE s.created_by = 'admin'" : ""} ORDER BY s.created_at DESC, s.detected_at DESC LIMIT 100`,
    )
    .all() as (SignalRow & { company_label: string })[];
  const companies = (db.prepare("SELECT id, COALESCE(short_name, company_name) || ' (#' || id || ')' label FROM companies ORDER BY label").all() as { id: number; label: string }[]);
  return (
    <div className="space-y-5">
      <SectionCard title="Create signal" subtitle="Manual signals are attributed to the 'Admin manual entry' source and trigger a score recalculation">
        <SignalCreateForm companies={companies} />
      </SectionCard>
      <SectionCard
        title="Recent signals"
        subtitle="Latest 100 by creation time"
        action={<a href={by === "admin" ? "/admin/signals" : "/admin/signals?by=admin"} className="text-xs link">{by === "admin" ? "Show all" : "Only manual"}</a>}
      >
        <ul className="divide-y divide-slate-100">
          {rows.map((s) => <SignalRowEditor key={s.id} s={s} showCompany />)}
        </ul>
      </SectionCard>
    </div>
  );
}
