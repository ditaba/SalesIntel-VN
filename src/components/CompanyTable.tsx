import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { PROVINCES } from "@/lib/constants";
import { badgesFor } from "@/lib/search";
import type { CompanyListRow } from "@/lib/types";
import { SaveButton } from "./SaveButton";
import { Badge, relDays, ScorePill } from "./ui";

export function WebsiteCell({ c }: { c: CompanyListRow }) {
  if (!c.website || c.website_exists === 0) return <span className="text-xs font-medium text-red-600">No website</span>;
  const host = c.website.replace(/^https?:\/\//, "");
  const q = c.website_quality_score;
  return (
    <div className="min-w-0">
      <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 truncate text-xs text-brand-700 hover:underline">
        <span className="truncate">{host}</span>
        <ExternalLink size={11} className="shrink-0" />
      </a>
      {q != null && (
        <span className={`text-[11px] ${q < 35 ? "text-red-600" : q < 50 ? "text-orange-600" : "text-slate-500"}`}>Quality {q}/100</span>
      )}
    </div>
  );
}

export function CompanyTable({ rows, savedIds, showSave = true }: { rows: CompanyListRow[]; savedIds: Set<number> | number[]; showSave?: boolean }) {
  const saved = savedIds instanceof Set ? savedIds : new Set(savedIds);
  return (
    <>
    {/* Mobile: stacked cards */}
    <ul className="card divide-y divide-slate-100 md:hidden">
      {rows.map((c) => (
        <li key={c.id} className="p-4" data-testid="company-card">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/companies/${c.id}`} className="font-semibold text-slate-900">{c.short_name || c.company_name}</Link>
              <p className="text-xs text-slate-500">{c.industry} · {PROVINCES[c.province]?.short ?? c.province} · {c.estimated_employee_range ?? "?"} emp.</p>
            </div>
            {showSave && <SaveButton companyId={c.id} initialSaved={saved.has(c.id)} />}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">{badgesFor(c).map((b) => <Badge key={b.key} tone={b.tone}>{b.label}</Badge>)}</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0 max-w-[55%]"><WebsiteCell c={c} /></div>
            <ScorePill score={c.ai_opportunity_score} level={c.ai_opportunity_level} />
          </div>
        </li>
      ))}
    </ul>
    <div className="card hidden overflow-hidden md:block">
      <div className="relative overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200" data-testid="company-table">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-th">Company</th>
              <th className="table-th">Industry</th>
              <th className="table-th">Location</th>
              <th className="table-th">Employees</th>
              <th className="table-th">Website</th>
              <th className="table-th">Signals</th>
              <th className="table-th">Opportunity</th>
              <th className="table-th whitespace-nowrap">Last updated</th>
              {showSave && <th className="table-th"><span className="sr-only">Save</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((c) => {
              const badges = badgesFor(c);
              return (
                <tr key={c.id} className="hover:bg-slate-50/70" data-testid="company-row">
                  <td className="table-td max-w-[260px]">
                    <Link href={`/companies/${c.id}`} className="font-semibold text-slate-900 hover:text-brand-700" data-testid="company-link">
                      {c.short_name || c.company_name}
                    </Link>
                    <p className="truncate text-xs text-slate-500" title={c.company_name}>{c.company_name}</p>
                  </td>
                  <td className="table-td whitespace-nowrap text-slate-700">{c.industry}</td>
                  <td className="table-td whitespace-nowrap">
                    <span className="text-slate-700">{PROVINCES[c.province]?.short ?? c.province}</span>
                    {c.district && <p className="text-xs text-slate-500">{c.district}</p>}
                  </td>
                  <td className="table-td whitespace-nowrap text-slate-700">{c.estimated_employee_range ?? "—"}</td>
                  <td className="table-td max-w-[170px]"><WebsiteCell c={c} /></td>
                  <td className="table-td min-w-[200px] max-w-[280px]">
                    <div className="flex flex-wrap gap-1">
                      {badges.length ? badges.map((b) => <Badge key={b.key} tone={b.tone}>{b.label}</Badge>) : <span className="text-xs text-slate-400">No active signals</span>}
                    </div>
                  </td>
                  <td className="table-td"><ScorePill score={c.ai_opportunity_score} level={c.ai_opportunity_level} /></td>
                  <td className="table-td whitespace-nowrap text-xs text-slate-500">
                    {relDays(c.last_updated_at)}
                    {c.latest_signal_date && <p className="text-[11px] text-slate-400">signal {relDays(c.latest_signal_date)}</p>}
                  </td>
                  {showSave && (
                    <td className="table-td">
                      <SaveButton companyId={c.id} initialSaved={saved.has(c.id)} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
