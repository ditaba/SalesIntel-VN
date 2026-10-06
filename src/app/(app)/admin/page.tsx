import Link from "next/link";
import { RecalculateButton } from "@/components/admin";
import { SectionCard, StatCard } from "@/components/ui";
import { getDb } from "@/lib/db";
import { llmEnabled, AI_MODEL } from "@/lib/llm";
import { SCORE_RULES, NORMALIZER } from "@/lib/scoring";

export const metadata = { title: "Admin" };

export default function AdminHome() {
  const db = getDb();
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Companies" value={n("SELECT COUNT(*) n FROM companies")} href="/admin/companies" />
        <StatCard label="Business signals" value={n("SELECT COUNT(*) n FROM business_signals")} href="/admin/signals" />
        <StatCard label="Raw observations" value={n("SELECT COUNT(*) n FROM raw_observations")} hint={`${n("SELECT COUNT(*) n FROM raw_observations WHERE processed = 0")} pending`} />
        <StatCard label="Data sources" value={n("SELECT COUNT(*) n FROM data_sources")} hint={`${n("SELECT COUNT(*) n FROM data_sources WHERE is_active = 1")} active`} href="/admin/sources" />
        <StatCard label="Users" value={n("SELECT COUNT(*) n FROM users")} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <SectionCard title="Scoring & analysis">
          <p className="text-sm text-slate-600">
            Re-runs the signal engine on pending observations, refreshes signal flags and recalculates every Opportunity Score with the deterministic rules below.
            AI narratives use: <b>{llmEnabled() ? `Claude (${AI_MODEL})` : "rules engine (set ANTHROPIC_API_KEY to enable Claude)"}</b>.
          </p>
          <div className="mt-4"><RecalculateButton /></div>
        </SectionCard>
        <SectionCard title="Opportunity score rules (rules-v1)" subtitle={`Score = min(100, round(raw × 100 / ${NORMALIZER})) · HIGH ≥ 70 · MEDIUM 40–69 · LOW < 40`}>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {SCORE_RULES.map((r) => (
                <tr key={r.rule}><td className="py-1.5 text-slate-700">{r.label}</td><td className="py-1.5 text-right font-semibold tabular-nums text-emerald-700">+{r.points}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Website rules are mutually exclusive (no website / poor / below average); recruitment and recency rules likewise.</p>
        </SectionCard>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/companies/new" className="card card-pad hover:border-brand-300"><p className="font-medium">Add a company</p><p className="muted">Manual entry with validation & duplicate check</p></Link>
        <Link href="/admin/import" className="card card-pad hover:border-brand-300"><p className="font-medium">Import CSV</p><p className="muted">Validate, de-duplicate, normalise and score</p></Link>
        <Link href="/admin/sources" className="card card-pad hover:border-brand-300"><p className="font-medium">Data sources & compliance</p><p className="muted">Legal / robots review before activation</p></Link>
      </div>
    </div>
  );
}
