import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { EmptyState, fmtDate, ScorePill, SignalTypeBadge, StrengthBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PROVINCE_NAMES, PROVINCES, SIGNAL_TYPE_KEYS, SIGNAL_TYPES } from "@/lib/constants";
import { getDb } from "@/lib/db";
import type { SignalRow } from "@/lib/types";

export const metadata = { title: "Signals" };

type Row = SignalRow & { short_name: string | null; company_name: string; industry: string; province: string; ai_opportunity_score: number; ai_opportunity_level: string };

export default async function SignalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const db = getDb();
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (sp.type && SIGNAL_TYPE_KEYS.includes(sp.type as never)) { where.push("s.signal_type = @type"); params.type = sp.type; }
  if (sp.strength && ["HIGH", "MEDIUM", "LOW"].includes(sp.strength)) { where.push("s.signal_strength = @strength"); params.strength = sp.strength; }
  if (sp.province && PROVINCE_NAMES.includes(sp.province)) { where.push("c.province = @province"); params.province = sp.province; }
  const days = Number(sp.days) || 0;
  if (days > 0) { where.push("s.detected_at >= @since"); params.since = new Date(Date.now() - days * 86400000).toISOString(); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 40;
  const total = (db.prepare(`SELECT COUNT(*) n FROM business_signals s JOIN companies c ON c.id = s.company_id ${w}`).get(params) as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT s.*, d.source_name, c.short_name, c.company_name, c.industry, c.province, c.ai_opportunity_score, c.ai_opportunity_level
       FROM business_signals s JOIN companies c ON c.id = s.company_id LEFT JOIN data_sources d ON d.id = s.source_id
       ${w} ORDER BY s.detected_at DESC, s.id DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as Row[];
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
    if (p > 1) u.set("page", String(p));
    return `/signals?${u}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Business Signals</h1>
        <p className="muted mt-1">Structured signals produced by the signal engine from public observations (job postings, news, website scans, social checks).</p>
      </div>
      <form className="card card-pad grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
        <select name="type" defaultValue={sp.type ?? ""} className="input">
          <option value="">All signal types</option>
          {SIGNAL_TYPE_KEYS.map((t) => <option key={t} value={t}>{SIGNAL_TYPES[t].label}</option>)}
        </select>
        <select name="strength" defaultValue={sp.strength ?? ""} className="input">
          <option value="">Any strength</option>
          <option>HIGH</option><option>MEDIUM</option><option>LOW</option>
        </select>
        <select name="province" defaultValue={sp.province ?? ""} className="input">
          <option value="">All provinces</option>
          {PROVINCE_NAMES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select name="days" defaultValue={sp.days ?? ""} className="input">
          <option value="">Any time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <div className="flex gap-2">
          <button className="btn-primary flex-1">Apply</button>
          <Link href="/signals" className="btn-secondary">Reset</Link>
        </div>
      </form>
      <p className="text-sm text-slate-600"><span className="font-semibold text-slate-900">{total}</span> signals</p>
      {rows.length === 0 ? (
        <EmptyState title="No signals match these filters" />
      ) : (
        <div className="card relative overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">Signal</th>
                <th className="table-th">Company</th>
                <th className="table-th">Description</th>
                <th className="table-th">Source</th>
                <th className="table-th">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="table-td whitespace-nowrap tabular-nums text-slate-600">{fmtDate(s.detected_at)}</td>
                  <td className="table-td"><div className="flex flex-col items-start gap-1"><SignalTypeBadge type={s.signal_type} /><StrengthBadge strength={s.signal_strength} /></div></td>
                  <td className="table-td min-w-[160px]">
                    <Link href={`/companies/${s.company_id}`} className="font-medium text-slate-900 hover:text-brand-700">{s.short_name || s.company_name}</Link>
                    <p className="text-xs text-slate-500">{s.industry} · {PROVINCES[s.province]?.short ?? s.province}</p>
                  </td>
                  <td className="table-td min-w-[260px] text-slate-700">{s.description}</td>
                  <td className="table-td whitespace-nowrap text-xs">
                    {s.source_url ? <a className="inline-flex items-center gap-1 text-brand-700 hover:underline" href={s.source_url} target="_blank" rel="noopener noreferrer nofollow">{s.source_name ?? "source"} <ExternalLink size={11} /></a> : <span className="text-slate-500">{s.created_by}</span>}
                  </td>
                  <td className="table-td"><ScorePill score={s.ai_opportunity_score} level={s.ai_opportunity_level} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > pageSize && (
        <nav className="flex items-center justify-between">
          {page > 1 ? <Link className="btn-secondary" href={qs(page - 1)}>← Previous</Link> : <span />}
          <span className="text-sm text-slate-500">Page {page} of {Math.ceil(total / pageSize)}</span>
          {page * pageSize < total ? <Link className="btn-secondary" href={qs(page + 1)}>Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
