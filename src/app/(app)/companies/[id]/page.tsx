import { ArrowLeft, Check, ExternalLink, Lightbulb, Minus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalyzeButton } from "@/components/AnalyzeButton";
import { SaveButton } from "@/components/SaveButton";
import { Badge, DemoBadge, fmtDate, relDays, ScoreGauge, SectionCard, SignalTypeBadge, StrengthBadge } from "@/components/ui";
import { latestScoreBreakdown, loadCompanyBundle } from "@/lib/analysis";
import { requireUser } from "@/lib/auth";
import { PROVINCES } from "@/lib/constants";
import { getDb, parseJSON } from "@/lib/db";
import { savedCompanyIds } from "@/lib/lists";
import { NORMALIZER, type ScoreRuleHit } from "@/lib/scoring";
import { badgesFor } from "@/lib/search";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = getDb().prepare("SELECT short_name, company_name FROM companies WHERE id = ?").get(Number((await params).id)) as { short_name: string; company_name: string } | undefined;
  return { title: c ? c.short_name || c.company_name : "Company" };
}

function Yes({ v, label }: { v: number | null | undefined; label: string }) {
  return (
    <li className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      {v == null ? <span className="text-xs text-slate-400">unknown</span> : v ? <span className="flex items-center gap-1 text-emerald-700"><Check size={14} />Yes</span> : <span className="flex items-center gap-1 text-slate-500"><Minus size={14} />No</span>}
    </li>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children || "—"}</dd>
    </div>
  );
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const db = getDb();
  const bundle = loadCompanyBundle(db, id);
  if (!bundle) notFound();
  const { company: c, profile: p, signals } = bundle;
  const score = latestScoreBreakdown(db, id);
  const breakdown = parseJSON<ScoreRuleHit[]>(score?.breakdown, []);
  const facts = parseJSON<string[]>(c.ai_facts, []);
  const inferences = parseJSON<string[]>(c.ai_inferences, []);
  const services = parseJSON<string[]>(c.ai_recommended_services, []);
  const reasons = parseJSON<string[]>(c.ai_sales_reasons, []);
  const saved = savedCompanyIds(db, user.id).has(id);
  const badges = badgesFor({ ...c, website_exists: p?.website_exists ?? null, website_quality_score: p?.website_quality_score ?? null });
  const sources = db
    .prepare(
      `SELECT d.source_name, d.source_type, d.base_url, o.observation_type, o.source_url, MAX(o.observed_at) last_checked, COUNT(*) n
       FROM raw_observations o LEFT JOIN data_sources d ON d.id = o.source_id WHERE o.company_id = ?
       GROUP BY o.source_url ORDER BY last_checked DESC`,
    )
    .all(id) as { source_name: string | null; source_type: string | null; base_url: string | null; observation_type: string; source_url: string | null; last_checked: string; n: number }[];
  const manualSignals = signals.filter((s) => !s.observation_id);
  const aiBy = c.ai_generated_by === "rules-engine" ? "Rules engine (deterministic)" : c.ai_generated_by;

  return (
    <div className="space-y-5">
      <Link href="/companies" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Companies
      </Link>

      {/* Overview header */}
      <div className="card card-pad">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="h1" data-testid="company-name">{c.short_name || c.company_name}</h1>
              {c.is_demo ? <DemoBadge /> : null}
              <Badge tone={c.company_status === "Active" ? "green" : "amber"}>{c.company_status}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">{c.company_name}</p>
            <p className="mt-2 text-sm text-slate-700">
              {c.industry} <span className="text-slate-300">|</span> {c.district ? `${c.district}, ` : ""}
              {c.province} <span className="text-slate-300">|</span> {c.estimated_employee_range ?? "?"} employees
              {c.website && (
                <>
                  {" "}
                  <span className="text-slate-300">|</span>{" "}
                  <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                    {c.website.replace(/^https?:\/\//, "")} <ExternalLink size={12} />
                  </a>
                </>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <Badge key={b.key} tone={b.tone}>{b.label}</Badge>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <SaveButton companyId={c.id} initialSaved={saved} size="md" />
            <AnalyzeButton companyId={c.id} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Score + WHY NOW */}
          <section className="card overflow-hidden">
            <div className="grid md:grid-cols-[200px_minmax(0,1fr)]">
              <div className="flex flex-col items-center justify-center gap-2 border-b border-slate-100 bg-slate-50/60 p-6 md:border-b-0 md:border-r">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Opportunity Score</p>
                <div data-testid="opportunity-score"><ScoreGauge score={c.ai_opportunity_score} level={c.ai_opportunity_level} /></div>
                <p className="text-center text-[11px] text-slate-500">Rule-based · {breakdown.length} rule{breakdown.length === 1 ? "" : "s"} matched</p>
              </div>
              <div className="space-y-4 p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI company summary</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700" data-testid="ai-summary">{c.ai_company_summary}</p>
                </div>
                <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-800">Why now?</p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-slate-800" data-testid="why-now">{c.ai_why_now}</p>
                </div>
                <p className="text-[11px] text-slate-400">
                  Narrative by {aiBy} · {relDays(c.ai_generated_at ? c.ai_generated_at.replace(" ", "T") + "Z" : null)}. Score is computed by rules, never by AI.
                </p>
              </div>
            </div>
          </section>

          {/* Facts vs Inference */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            <SectionCard title={<span className="flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-600" />Facts</span>} subtitle="Verified from stored signals and profile data">
              <ul className="space-y-2" data-testid="facts">
                {facts.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />{f}</li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard title={<span className="flex items-center gap-2"><Lightbulb size={16} className="text-amber-500" />AI inference</span>} subtitle="Interpretation — not verified fact">
              <ul className="space-y-2" data-testid="inferences">
                {inferences.map((f, i) => (
                  <li key={i} className="rounded-lg bg-amber-50/60 px-3 py-2 text-sm italic text-slate-700">{f}</li>
                ))}
              </ul>
            </SectionCard>
          </div>

          {/* Services + pitch */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            <SectionCard title="Recommended services to sell">
              <ul className="space-y-2" data-testid="services">
                {services.map((s, i) => (
                  <li key={s} className="flex items-center gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{i + 1}</span>
                    <span className="text-slate-800">{s}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard title="Suggested sales approach">
              <p className="text-sm leading-relaxed text-slate-700" data-testid="pitch">{c.ai_recommended_sales_pitch}</p>
              {reasons.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Talking points</p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                    {reasons.slice(0, 5).map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Signals timeline */}
          <SectionCard title="Business signals" subtitle="Timeline of detected signals, newest first, each linked to its public source" action={<span className="text-xs text-slate-500">{signals.length} signals</span>}>
            {signals.length === 0 ? (
              <p className="text-sm text-slate-500">No business signals detected yet.</p>
            ) : (
              <ol className="relative ml-2 border-l border-slate-200" data-testid="signal-timeline">
                {signals.map((s) => (
                  <li key={s.id} className="mb-5 ml-5 last:mb-0">
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                    <div className="flex flex-wrap items-center gap-2">
                      <time className="text-sm font-semibold tabular-nums text-slate-900">{fmtDate(s.detected_at)}</time>
                      <SignalTypeBadge type={s.signal_type} />
                      <StrengthBadge strength={s.signal_strength} />
                      {s.created_by !== "engine" && <Badge tone="gray">{s.created_by}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{s.description}</p>
                    {s.source_url && (
                      <a href={s.source_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700">
                        Source: {s.source_name ?? "link"} <ExternalLink size={11} />
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          {/* Score breakdown */}
          <SectionCard title="How this score was calculated" subtitle={`Deterministic rules (${score?.model_version ?? "rules-v1"}). Raw points × 100 / ${NORMALIZER}, capped at 100.`}>
            <table className="w-full text-sm" data-testid="score-breakdown">
              <tbody className="divide-y divide-slate-100">
                {breakdown.map((b) => (
                  <tr key={b.rule}>
                    <td className="py-2 text-slate-700">{b.label}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-emerald-700">+{b.points}</td>
                  </tr>
                ))}
                {breakdown.length === 0 && (
                  <tr><td className="py-2 text-slate-500">No scoring rules matched.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td className="pt-2 font-medium text-slate-900">Raw points → normalized score</td>
                  <td className="pt-2 text-right font-semibold tabular-nums text-slate-900">{score?.raw_points ?? 0} → {c.ai_opportunity_score}</td>
                </tr>
              </tfoot>
            </table>
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <SectionCard title="Company information">
            <dl className="divide-y divide-slate-100">
              <Info label="Legal name">{c.company_name}</Info>
              <Info label="Tax code (MST)"><span className="font-mono">{c.tax_code}</span></Info>
              <Info label="Legal entity type">{c.legal_entity_type}</Info>
              <Info label="Industry">{c.industry}</Info>
              <Info label="Business description">{c.business_description}</Info>
              <Info label="Address">{c.address}</Info>
              <Info label="Province / district">{c.province}{c.district ? ` · ${c.district}` : ""} ({PROVINCES[c.province]?.short ?? c.province})</Info>
              <Info label="Founded">{c.founded_date}</Info>
              <Info label="Estimated employees">{c.estimated_employee_range}</Info>
              <Info label="Status">{c.company_status}</Info>
              <Info label="Last updated">{fmtDate(c.last_updated_at)}</Info>
            </dl>
          </SectionCard>

          <SectionCard title="Digital presence">
            {p ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-slate-600">Website quality</span>
                  <span className={`text-sm font-semibold tabular-nums ${p.website_quality_score == null ? "text-slate-400" : p.website_quality_score < 35 ? "text-red-600" : p.website_quality_score < 50 ? "text-orange-600" : "text-emerald-700"}`}>
                    {p.website_exists ? (p.website_quality_score != null ? `${p.website_quality_score}/100` : "not assessed") : "no website"}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  <Yes v={p.website_exists} label="Website exists" />
                  <Yes v={p.website_exists ? p.website_mobile_friendly : null} label="Mobile-friendly" />
                  <Yes v={p.website_exists ? p.website_https : null} label="HTTPS" />
                  <Yes v={p.online_booking_available} label="Online booking" />
                  <Yes v={p.ecommerce_presence} label="E-commerce" />
                  <Yes v={p.facebook_page_exists} label="Facebook page" />
                  <Yes v={p.linkedin_company_page_exists} label="LinkedIn company page" />
                  <Yes v={p.google_business_profile} label="Google Business Profile" />
                </ul>
                {p.website_last_updated_year && <p className="mt-2 text-xs text-slate-500">Website content last updated: {p.website_last_updated_year}</p>}
              </>
            ) : (
              <p className="text-sm text-slate-500">No digital profile yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Sources" subtitle="Every record keeps a reference to its public source">
            <ul className="space-y-3 text-sm" data-testid="sources">
              {c.public_source_url && (
                <li>
                  <p className="font-medium text-slate-800">Company record</p>
                  <a href={c.public_source_url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-xs text-brand-700 hover:underline">{c.public_source_url}</a>
                </li>
              )}
              {sources.map((s) => (
                <li key={s.source_url ?? s.observation_type}>
                  <p className="font-medium text-slate-800">
                    {s.source_name ?? "Unknown source"} <span className="font-normal text-slate-500">· {s.observation_type.replace("_", " ").toLowerCase()}</span>
                  </p>
                  {s.source_url && <a href={s.source_url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-xs text-brand-700 hover:underline">{s.source_url}</a>}
                  <p className="text-xs text-slate-500">Last checked {fmtDate(s.last_checked)}</p>
                </li>
              ))}
              {manualSignals.length > 0 && <li className="text-xs text-slate-500">+ {manualSignals.length} signal(s) entered manually by an admin</li>}
            </ul>
            {c.is_demo ? <p className="mt-4 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">Demo record: all sources are synthetic and hosted on the reserved example.org domain.</p> : null}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
