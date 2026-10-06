import { ArrowRight, Bookmark, Building2, Flame, Radio } from "lucide-react";
import Link from "next/link";
import { HBarChart, ScoreHistogram } from "@/components/Charts";
import { relDays, ScorePill, SectionCard, SignalTypeBadge, StatCard } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PROVINCES, SIGNAL_TYPES, type SignalType } from "@/lib/constants";
import { getDb, parseJSON } from "@/lib/db";
import { dashboardStats } from "@/lib/stats";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const s = dashboardStats(getDb(), user.id);

  return (
    <div className="space-y-6">
      {sp.error === "admin_only" && <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">The Admin area requires an admin account (try admin@salesintel.vn).</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h1">Good day, {user.name.split(" ")[0]}</h1>
          <p className="muted mt-1">Which Vietnamese companies should you contact today — and why?</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai-search?q=Which%20companies%20should%20I%20contact%20today%3F" className="btn-secondary">Ask AI: who to contact today?</Link>
          <Link href="/companies?level=HIGH" className="btn-primary">
            View high opportunities <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total companies" value={s.total.toLocaleString()} hint="Demo dataset · 8 provinces · 12 industries" href="/companies" icon={<Building2 size={18} />} />
        <StatCard label="High opportunity" value={s.high} hint={`${s.medium} more at MEDIUM`} href="/companies?level=HIGH" icon={<Flame size={18} />} />
        <StatCard label="New signals this week" value={s.newSignals} hint={`across ${s.newSignalCompanies} companies`} href="/signals?days=7" icon={<Radio size={18} />} />
        <StatCard label="Saved leads" value={s.saved} hint={`in ${s.lists} lead list${s.lists === 1 ? "" : "s"}`} href="/leads" icon={<Bookmark size={18} />} />
      </div>

      {s.contactToday.length > 0 && (
        <SectionCard title="Contact today" subtitle="High scores with signals in the last 14 days">
          <div className="grid gap-4 md:grid-cols-3">
            {s.contactToday.map((c) => (
              <Link key={c.id} href={`/companies/${c.id}`} className="group rounded-xl border border-slate-200 p-4 transition hover:border-brand-300 hover:shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{c.short_name || c.company_name}</p>
                    <p className="text-xs text-slate-500">
                      {c.industry} · {PROVINCES[c.province]?.short ?? c.province}
                    </p>
                  </div>
                  <ScorePill score={c.ai_opportunity_score} level={c.ai_opportunity_level} />
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-slate-600">{c.ai_why_now}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {parseJSON<string[]>(c.ai_recommended_services, []).slice(0, 3).map((x) => (
                    <span key={x} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{x}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-3">
        <SectionCard title="Top opportunities" className="xl:col-span-1" action={<Link href="/companies" className="text-xs link">All companies</Link>}>
          <ol className="-my-2 divide-y divide-slate-100">
            {s.topOpportunities.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="w-5 text-xs tabular-nums text-slate-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/companies/${c.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700">{c.short_name || c.company_name}</Link>
                  <p className="truncate text-xs text-slate-500">
                    {c.industry} · {PROVINCES[c.province]?.short ?? c.province}
                  </p>
                </div>
                <ScorePill score={c.ai_opportunity_score} level={c.ai_opportunity_level} />
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard title="Latest business signals" className="xl:col-span-2" action={<Link href="/signals" className="text-xs link">Signal feed</Link>}>
          <ul className="-my-2 divide-y divide-slate-100">
            {s.latestSignals.map((sig) => (
              <li key={sig.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <span className="w-24 shrink-0 text-xs text-slate-500">{relDays(sig.detected_at)}</span>
                <span className="w-32 shrink-0"><SignalTypeBadge type={sig.signal_type} /></span>
                <div className="min-w-0 flex-1">
                  <Link href={`/companies/${sig.company_id}`} className="text-sm font-medium text-slate-900 hover:text-brand-700">{sig.short_name || sig.company_name}</Link>
                  <p className="truncate text-xs text-slate-500">{sig.description}</p>
                </div>
                <span className="text-xs tabular-nums text-slate-500">Score {sig.ai_opportunity_score}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <SectionCard title="Top industries" subtitle="Companies with MEDIUM or HIGH opportunity">
          <HBarChart data={s.topIndustries.map((d) => ({ ...d, href: `/companies?industry=${encodeURIComponent(d.label)}&level=HIGH,MEDIUM` }))} unit="opportunities" />
        </SectionCard>
        <SectionCard title="Top locations" subtitle="Companies with MEDIUM or HIGH opportunity">
          <HBarChart data={s.topLocations.map((d) => ({ ...d, href: `/companies?province=${encodeURIComponent(d.label)}&level=HIGH,MEDIUM` }))} unit="opportunities" />
        </SectionCard>
        <SectionCard title="Opportunity score distribution" subtitle="All companies, by 10-point band">
          <ScoreHistogram data={s.distribution} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />LOW &lt; 40</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-600" />MEDIUM 40–69</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />HIGH ≥ 70</span>
          </div>
        </SectionCard>
        <SectionCard title="Signals detected (last 30 days)" subtitle="By signal type" className="lg:col-span-2 xl:col-span-3">
          <HBarChart
            height={Math.max(180, s.signalTypes.length * 26)}
            data={s.signalTypes.map((d) => ({ label: SIGNAL_TYPES[d.label as SignalType]?.label ?? d.label, value: d.value, href: `/signals?type=${d.label}&days=30` }))}
            unit="signals"
          />
        </SectionCard>
      </div>
    </div>
  );
}
