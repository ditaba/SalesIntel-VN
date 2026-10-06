"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EMPLOYEE_RANGES, INDUSTRIES, PROVINCES, PROVINCE_NAMES } from "@/lib/constants";
import { filtersToParams, HIRING_OPTIONS, SIGNAL_OPTIONS, WEBSITE_OPTIONS, type SearchFilters } from "@/lib/search";

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const a = arr ?? [];
  return a.includes(v) ? a.filter((x) => x !== v) : [...a, v];
}

function Check({ checked, onChange, label, testid }: { checked: boolean; onChange: () => void; label: string; testid?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-slate-700 hover:text-slate-900">
      <input type="checkbox" data-testid={testid} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

export function FilterSidebar({ filters }: { filters: SearchFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState<SearchFilters>(filters);
  const [q, setQ] = useState(filters.q ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setF(filters);
    setQ(filters.q ?? "");
  }, [filters]);

  function apply(next: SearchFilters) {
    setF(next);
    const p = filtersToParams({ ...next, page: 1 });
    router.push(`${pathname}?${p.toString()}`);
  }

  const activeCount =
    (f.q ? 1 : 0) + (f.province ? 1 : 0) + (f.district ? 1 : 0) + (f.industry?.length ?? 0) + (f.size?.length ?? 0) + (f.website ? 1 : 0) +
    (f.hiring?.length ?? 0) + (f.signals?.length ?? 0) + (f.level?.length ?? 0) + (f.growthAny ? 1 : 0) + (f.minScore != null ? 1 : 0) + (f.signalWithinDays != null ? 1 : 0);

  const panel = (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ ...f, q: q.trim() || undefined });
        }}
      >
        <label className="label" htmlFor="kw">Keyword</label>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input id="kw" data-testid="filter-keyword" className="input pl-8" placeholder="Name, tax code, description…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </form>

      <Group title="Opportunity score">
        <div className="flex gap-1.5">
          {(["HIGH", "MEDIUM", "LOW"] as const).map((l) => {
            const on = f.level?.includes(l);
            return (
              <button
                key={l}
                data-testid={`level-${l}`}
                onClick={() => apply({ ...f, level: toggle(f.level, l) })}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {l}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Location">
        <select data-testid="filter-province" className="input" value={f.province ?? ""} onChange={(e) => apply({ ...f, province: e.target.value || undefined, district: undefined })}>
          <option value="">All provinces</option>
          {PROVINCE_NAMES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select data-testid="filter-district" className="input mt-2" disabled={!f.province} value={f.district ?? ""} onChange={(e) => apply({ ...f, district: e.target.value || undefined })}>
          <option value="">{f.province ? "All districts" : "Select a province first"}</option>
          {f.province && PROVINCES[f.province]?.districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Group>

      <Group title="Industry">
        <div className="max-h-56 overflow-y-auto pr-1">
          {INDUSTRIES.map((i) => (
            <Check key={i} testid={`industry-${i}`} label={i} checked={!!f.industry?.includes(i)} onChange={() => apply({ ...f, industry: toggle(f.industry, i) })} />
          ))}
        </div>
      </Group>

      <Group title="Company size (employees)">
        <div className="flex flex-wrap gap-1.5">
          {EMPLOYEE_RANGES.map((s) => {
            const on = f.size?.includes(s);
            return (
              <button key={s} onClick={() => apply({ ...f, size: toggle(f.size, s) })} className={`rounded-md border px-2 py-1 text-xs font-medium ${on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                {s}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Website">
        {WEBSITE_OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-slate-700">
            <input type="radio" name="website" data-testid={`website-${o.value}`} className="h-4 w-4 border-slate-300 text-brand-600" checked={f.website === o.value} onChange={() => apply({ ...f, website: o.value })} />
            {o.label}
          </label>
        ))}
        {f.website && (
          <button className="mt-1 text-xs text-brand-700 hover:underline" onClick={() => apply({ ...f, website: undefined })}>
            Any website status
          </button>
        )}
      </Group>

      <Group title="Hiring">
        {HIRING_OPTIONS.map((o) => (
          <Check key={o.value} testid={`hiring-${o.value}`} label={o.label} checked={!!f.hiring?.includes(o.value)} onChange={() => apply({ ...f, hiring: toggle(f.hiring, o.value) })} />
        ))}
      </Group>

      <Group title="Business signals">
        <Check label="Growing (new branch or expansion)" checked={!!f.growthAny} onChange={() => apply({ ...f, growthAny: f.growthAny ? undefined : true })} />
        {SIGNAL_OPTIONS.map((o) => (
          <Check key={o.value} testid={`signal-${o.value}`} label={o.label} checked={!!f.signals?.includes(o.value)} onChange={() => apply({ ...f, signals: toggle(f.signals, o.value) })} />
        ))}
        <select className="input mt-2" value={f.signalWithinDays ?? ""} onChange={(e) => apply({ ...f, signalWithinDays: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Any signal date</option>
          <option value="7">Signal in last 7 days</option>
          <option value="30">Signal in last 30 days</option>
          <option value="90">Signal in last 90 days</option>
        </select>
      </Group>

      {activeCount > 0 && (
        <button data-testid="clear-filters" className="btn-secondary w-full" onClick={() => apply({ sort: f.sort })}>
          <X size={14} /> Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );

  return (
    <>
      <button className="btn-secondary w-full lg:hidden" onClick={() => setMobileOpen((o) => !o)}>
        <SlidersHorizontal size={15} /> Filters {activeCount > 0 && `(${activeCount})`}
      </button>
      <div className={`${mobileOpen ? "block" : "hidden"} card card-pad lg:block`}>{panel}</div>
    </>
  );
}

export function SortSelect({ filters }: { filters: SearchFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      data-testid="sort-select"
      aria-label="Sort by"
      className="input w-auto py-1.5"
      value={filters.sort ?? "score"}
      onChange={(e) => router.push(`${pathname}?${filtersToParams({ ...filters, sort: e.target.value as SearchFilters["sort"] }).toString()}`)}
    >
      <option value="score">Sort: Opportunity Score</option>
      <option value="signal">Sort: Most recent signal</option>
      <option value="size">Sort: Company size</option>
      <option value="updated">Sort: Recently updated</option>
      <option value="name">Sort: Name (A–Z)</option>
    </select>
  );
}
