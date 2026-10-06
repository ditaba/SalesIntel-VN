import Link from "next/link";
import { DeleteCompanyButton } from "@/components/admin";
import { DemoBadge, ScorePill } from "@/components/ui";
import { getDb } from "@/lib/db";
import { searchCompanies } from "@/lib/search";

export const metadata = { title: "Admin · Companies" };

export default async function AdminCompanies({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, pageSize } = searchCompanies(getDb(), { q: sp.q, sort: "updated", page, pageSize: 30 });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex gap-2">
          <input name="q" defaultValue={sp.q} className="input w-72" placeholder="Search name, tax code…" data-testid="admin-company-search" />
          <button className="btn-secondary">Search</button>
        </form>
        <Link href="/admin/companies/new" className="btn-primary" data-testid="add-company">+ Add company</Link>
      </div>
      <p className="text-sm text-slate-500">{total} companies · sorted by last updated</p>
      <div className="card relative overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50"><tr><th className="table-th">Company</th><th className="table-th">Tax code</th><th className="table-th">Industry</th><th className="table-th">Province</th><th className="table-th">Score</th><th className="table-th">Updated</th><th className="table-th" /></tr></thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="table-td">
                  <Link href={`/admin/companies/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700">{c.short_name || c.company_name}</Link>{" "}
                  {c.is_demo ? <DemoBadge /> : null}
                  <p className="text-xs text-slate-500">{c.company_name}</p>
                </td>
                <td className="table-td font-mono text-xs">{c.tax_code ?? "—"}</td>
                <td className="table-td whitespace-nowrap">{c.industry}</td>
                <td className="table-td whitespace-nowrap">{c.province}</td>
                <td className="table-td"><ScorePill score={c.ai_opportunity_score} level={c.ai_opportunity_level} /></td>
                <td className="table-td whitespace-nowrap text-xs text-slate-500">{c.last_updated_at.slice(0, 16)}</td>
                <td className="table-td whitespace-nowrap">
                  <Link href={`/admin/companies/${c.id}`} className="btn-ghost btn-sm">Edit</Link>
                  <DeleteCompanyButton id={c.id} name={c.short_name || c.company_name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between">
        {page > 1 ? <Link className="btn-secondary" href={`/admin/companies?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(page - 1) })}`}>← Previous</Link> : <span />}
        {page * pageSize < total ? <Link className="btn-secondary" href={`/admin/companies?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(page + 1) })}`}>Next →</Link> : <span />}
      </div>
    </div>
  );
}
