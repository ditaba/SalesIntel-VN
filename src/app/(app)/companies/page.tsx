import { Download } from "lucide-react";
import Link from "next/link";
import { CompanyTable } from "@/components/CompanyTable";
import { FilterSidebar, SortSelect } from "@/components/FilterSidebar";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { filtersFromParams, filtersToParams, searchCompanies } from "@/lib/search";
import { savedCompanyIds } from "@/lib/lists";

export const metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = filtersFromParams(await searchParams);
  const db = getDb();
  const { rows, total, page, pageSize } = searchCompanies(db, filters);
  const saved = savedCompanyIds(db, user.id);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (p: number) => `/companies?${(() => {
    const sp = filtersToParams(filters);
    if (p > 1) sp.set("page", String(p));
    return sp.toString();
  })()}`;
  const exportHref = `/api/companies/export?${filtersToParams(filters).toString()}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Companies</h1>
          <p className="muted mt-1">Search and filter Vietnamese companies by location, size, website and business signals.</p>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <FilterSidebar filters={filters} />
        </aside>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600" data-testid="result-count">
              <span className="font-semibold text-slate-900">{total.toLocaleString()}</span> compan{total === 1 ? "y" : "ies"}
              {total > 0 && (
                <span className="text-slate-400"> · showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <a href={exportHref} className="btn-secondary py-1.5" title="Export current results as CSV">
                <Download size={14} /> CSV
              </a>
              <SortSelect filters={filters} />
            </div>
          </div>
          {rows.length ? (
            <CompanyTable rows={rows} savedIds={saved} />
          ) : (
            <EmptyState title="No companies match these filters">Try removing a filter or broadening the location.</EmptyState>
          )}
          {pages > 1 && (
            <nav className="flex items-center justify-between pt-1" aria-label="Pagination">
              {page > 1 ? <Link className="btn-secondary" href={pageHref(page - 1)}>← Previous</Link> : <span />}
              <span className="text-sm text-slate-500">Page {page} of {pages}</span>
              {page < pages ? <Link className="btn-secondary" data-testid="next-page" href={pageHref(page + 1)}>Next →</Link> : <span />}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
