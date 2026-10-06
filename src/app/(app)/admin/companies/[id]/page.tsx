import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAnalyzeButton, CompanyForm, DeleteCompanyButton, ObservationForm, SignalCreateForm, SignalRowEditor } from "@/components/admin";
import { ScorePill, SectionCard } from "@/components/ui";
import { loadCompanyBundle } from "@/lib/analysis";
import { getDb } from "@/lib/db";

export const metadata = { title: "Admin · Edit company" };

export default async function EditCompany({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const id = Number((await params).id);
  const b = loadCompanyBundle(getDb(), id);
  if (!b) notFound();
  const { company: c, signals } = b;
  const created = (await searchParams).created;
  return (
    <div className="space-y-5">
      {created && <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">Company created and scored.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{c.short_name || c.company_name}</h2>
          <ScorePill score={c.ai_opportunity_score} level={c.ai_opportunity_level} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/companies/${c.id}`} className="btn-secondary">View intelligence page</Link>
          <AdminAnalyzeButton companyId={c.id} />
          <DeleteCompanyButton id={c.id} name={c.short_name || c.company_name} redirectTo="/admin/companies" />
        </div>
      </div>
      <SectionCard title="Company details">
        <CompanyForm initial={{ ...c, id: c.id, short_name: c.short_name ?? "", tax_code: c.tax_code ?? "", business_description: c.business_description ?? "", district: c.district ?? "", address: c.address ?? "", website: c.website ?? "", founded_date: c.founded_date ?? "", estimated_employee_range: c.estimated_employee_range ?? "", legal_entity_type: c.legal_entity_type ?? "", public_source_url: c.public_source_url ?? "" }} />
      </SectionCard>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-2">
        <SectionCard title="Ingest a raw observation" subtitle="Paste a job posting, news headline, website scan or social check — the signal engine converts it into structured signals">
          <ObservationForm companyId={c.id} />
        </SectionCard>
        <SectionCard title="Add a signal manually">
          <SignalCreateForm companyId={c.id} />
        </SectionCard>
      </div>
      <SectionCard title={`Business signals (${signals.length})`}>
        <ul className="divide-y divide-slate-100" data-testid="admin-signal-list">
          {signals.map((s) => <SignalRowEditor key={s.id} s={s} />)}
        </ul>
      </SectionCard>
    </div>
  );
}
