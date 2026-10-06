import Link from "next/link";
import { ListActions, NewListForm, RemoveFromList } from "@/components/LeadListControls";
import { WebsiteCell } from "@/components/CompanyTable";
import { Badge, EmptyState, relDays, ScorePill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PROVINCES } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { userLists } from "@/lib/lists";
import { badgesFor } from "@/lib/search";
import type { CompanyListRow } from "@/lib/types";

export const metadata = { title: "Saved Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const user = await requireUser();
  const db = getDb();
  const lists = userLists(db, user.id);
  const sp = await searchParams;
  const active = lists.find((l) => l.id === Number(sp.list)) ?? lists[0];
  const rows = active
    ? (db
        .prepare(
          `SELECT c.*, p.website_exists, p.website_quality_score, sc.created_at saved_at FROM saved_companies sc
           JOIN companies c ON c.id = sc.company_id LEFT JOIN company_digital_profiles p ON p.company_id = c.id
           WHERE sc.list_id = ? ORDER BY c.ai_opportunity_score DESC`,
        )
        .all(active.id) as (CompanyListRow & { saved_at: string })[])
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Saved Leads</h1>
        <p className="muted mt-1">Organise prospects into lead lists and export them to your CRM.</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <NewListForm />
          <ul className="space-y-1.5" data-testid="lead-lists">
            {lists.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/leads?list=${l.id}`}
                  className={`block rounded-xl border px-4 py-3 transition ${active?.id === l.id ? "border-brand-400 bg-brand-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}
                >
                  <p className="font-medium text-slate-900">{l.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {l.count} compan{l.count === 1 ? "y" : "ies"}
                    {l.count > 0 && ` · avg score ${l.avg_score} · ${l.high} high`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-w-0">
          {!active ? (
            <EmptyState title="No lead lists yet">Create a list, then save companies from search results or company pages.</EmptyState>
          ) : (
            <div className="card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900" data-testid="active-list-name">{active.name}</h2>
                  {active.description && <p className="text-sm text-slate-500">{active.description}</p>}
                </div>
                <ListActions key={active.id} id={active.id} name={active.name} />
              </div>
              {rows.length === 0 ? (
                <div className="p-6"><EmptyState title="This list is empty">Use the bookmark button on any company to add it here. <Link href="/companies" className="link">Browse companies</Link></EmptyState></div>
              ) : (
                <ul className="divide-y divide-slate-100" data-testid="list-companies">
                  {rows.map((c) => (
                    <li key={c.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        <Link href={`/companies/${c.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{c.short_name || c.company_name}</Link>
                        <p className="text-xs text-slate-500">
                          {c.industry} · {PROVINCES[c.province]?.short ?? c.province} · {c.estimated_employee_range} emp. · saved {relDays(c.saved_at.replace(" ", "T") + "Z")}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">{badgesFor(c).map((b) => <Badge key={b.key} tone={b.tone}>{b.label}</Badge>)}</div>
                        {c.ai_why_now && <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{c.ai_why_now}</p>}
                      </div>
                      <div className="w-40"><WebsiteCell c={c} /></div>
                      <ScorePill score={c.ai_opportunity_score} level={c.ai_opportunity_level} />
                      <RemoveFromList listId={active.id} companyId={c.id} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
