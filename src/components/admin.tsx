"use client";

import { Loader2, Pencil, Play, RefreshCw, Save, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EMPLOYEE_RANGES, INDUSTRIES, LEGAL_ENTITY_TYPES, OBSERVATION_TYPES, PROVINCES, PROVINCE_NAMES, SIGNAL_TYPE_KEYS, SIGNAL_TYPES } from "@/lib/constants";
import type { DataSourceRow, SignalRow } from "@/lib/types";
import { Badge, SignalTypeBadge, StrengthBadge } from "./ui";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function Msg({ ok, text }: { ok: boolean; text: string }) {
  return <p role="status" className={`rounded-lg px-3 py-2 text-sm ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{text}</p>;
}

// ---------------- Recalculate ----------------
export function RecalculateButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        data-testid="recalc-all"
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { ok, data } = await send("/api/admin/recalculate", "POST", {});
          setBusy(false);
          setMsg(ok ? `Recalculated ${data.companies} companies in ${data.ms} ms · ${data.changed} score(s) changed · ${data.processedObservations} pending observation(s) processed` : data.error);
          router.refresh();
        }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Recalculate all opportunity scores
      </button>
      {msg && <p className="text-xs text-slate-600" data-testid="recalc-msg">{msg}</p>}
    </div>
  );
}

// ---------------- Company form ----------------
export interface CompanyFormValue {
  id?: number;
  company_name: string;
  short_name: string;
  tax_code: string;
  industry: string;
  business_description: string;
  province: string;
  district: string;
  address: string;
  website: string;
  company_status: string;
  founded_date: string;
  estimated_employee_range: string;
  legal_entity_type: string;
  public_source_url: string;
}

export function CompanyForm({ initial }: { initial?: Partial<CompanyFormValue> }) {
  const router = useRouter();
  const [v, setV] = useState<CompanyFormValue>({
    company_name: "", short_name: "", tax_code: "", industry: INDUSTRIES[0], business_description: "", province: PROVINCE_NAMES[0], district: "",
    address: "", website: "", company_status: "Active", founded_date: "", estimated_employee_range: "11-50", legal_entity_type: LEGAL_ENTITY_TYPES[0], public_source_url: "",
    ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, x]) => [k, x ?? ""])),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof CompanyFormValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { ok, data } = await send(v.id ? `/api/admin/companies/${v.id}` : "/api/admin/companies", v.id ? "PATCH" : "POST", v);
    setBusy(false);
    if (!ok) return setMsg({ ok: false, text: data.error });
    if (!v.id) router.push(`/admin/companies/${data.id}?created=1`);
    else {
      setMsg({ ok: true, text: `Saved. Opportunity score recalculated: ${data.score?.score} (${data.score?.level}).` });
      router.refresh();
    }
  }

  const districts = PROVINCES[v.province]?.districts ?? [];
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" data-testid="company-form">
      <div className="sm:col-span-2">
        <label className="label">Legal company name *</label>
        <input name="company_name" className="input" required value={v.company_name} onChange={set("company_name")} />
      </div>
      <div><label className="label">Brand / short name</label><input name="short_name" className="input" value={v.short_name} onChange={set("short_name")} /></div>
      <div><label className="label">Tax code (10 digits)</label><input name="tax_code" className="input font-mono" value={v.tax_code} onChange={set("tax_code")} /></div>
      <div>
        <label className="label">Industry *</label>
        <select name="industry" className="input" value={v.industry} onChange={set("industry")}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select>
      </div>
      <div>
        <label className="label">Employees</label>
        <select name="estimated_employee_range" className="input" value={v.estimated_employee_range} onChange={set("estimated_employee_range")}>
          <option value="">Unknown</option>
          {EMPLOYEE_RANGES.map((i) => <option key={i}>{i}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Province *</label>
        <select name="province" className="input" value={v.province} onChange={(e) => setV({ ...v, province: e.target.value, district: "" })}>{PROVINCE_NAMES.map((i) => <option key={i}>{i}</option>)}</select>
      </div>
      <div>
        <label className="label">District</label>
        <input name="district" className="input" list="district-options" value={v.district} onChange={set("district")} />
        <datalist id="district-options">{districts.map((d) => <option key={d} value={d} />)}</datalist>
      </div>
      <div className="sm:col-span-2"><label className="label">Address</label><input name="address" className="input" value={v.address} onChange={set("address")} /></div>
      <div><label className="label">Website</label><input name="website" className="input" placeholder="example.vn" value={v.website} onChange={set("website")} /></div>
      <div><label className="label">Founded (YYYY or YYYY-MM-DD)</label><input name="founded_date" className="input" value={v.founded_date} onChange={set("founded_date")} /></div>
      <div>
        <label className="label">Legal entity type</label>
        <select name="legal_entity_type" className="input" value={v.legal_entity_type} onChange={set("legal_entity_type")}>{LEGAL_ENTITY_TYPES.map((i) => <option key={i}>{i}</option>)}</select>
      </div>
      <div>
        <label className="label">Status</label>
        <select name="company_status" className="input" value={v.company_status} onChange={set("company_status")}>
          {["Active", "Temporarily suspended", "Dissolved"].map((i) => <option key={i}>{i}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2"><label className="label">Business description</label><textarea name="business_description" rows={2} className="input" value={v.business_description} onChange={set("business_description")} /></div>
      <div className="sm:col-span-2"><label className="label">Public source URL</label><input name="public_source_url" className="input" placeholder="https://…" value={v.public_source_url} onChange={set("public_source_url")} /></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={busy} data-testid="company-save">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {v.id ? "Save changes" : "Create company"}
        </button>
        {msg && <Msg {...msg} />}
      </div>
    </form>
  );
}

export function DeleteCompanyButton({ id, name, redirectTo }: { id: number; name: string; redirectTo?: string }) {
  const router = useRouter();
  return (
    <button
      data-testid={`delete-company-${id}`}
      className="btn-ghost btn-sm text-red-600 hover:bg-red-50"
      onClick={async () => {
        if (!confirm(`Delete "${name}" and all its signals? This cannot be undone.`)) return;
        await send(`/api/admin/companies/${id}`, "DELETE");
        if (redirectTo) router.push(redirectTo);
        router.refresh();
      }}
    >
      <Trash2 size={14} /> Delete
    </button>
  );
}

// ---------------- Signals ----------------
function SignalFields({ v, setV }: { v: Record<string, string>; setV: (x: Record<string, string>) => void }) {
  return (
    <>
      <select className="input" value={v.signal_type} onChange={(e) => setV({ ...v, signal_type: e.target.value })} data-testid="signal-type">
        {SIGNAL_TYPE_KEYS.map((t) => <option key={t} value={t}>{SIGNAL_TYPES[t].label}</option>)}
      </select>
      <select className="input" value={v.signal_strength} onChange={(e) => setV({ ...v, signal_strength: e.target.value })}>
        <option>HIGH</option><option>MEDIUM</option><option>LOW</option>
      </select>
      <input type="date" className="input" value={v.detected_at} onChange={(e) => setV({ ...v, detected_at: e.target.value })} />
      <input className="input sm:col-span-3" placeholder="Description (e.g. Opened a new showroom in District 7)" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} data-testid="signal-description" />
      <input className="input sm:col-span-2" placeholder="Source URL (https://…)" value={v.source_url} onChange={(e) => setV({ ...v, source_url: e.target.value })} />
      <input className="input" type="number" min={0} placeholder="Quantity (hiring)" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} />
    </>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function SignalCreateForm({ companyId, companies }: { companyId?: number; companies?: { id: number; label: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>({ signal_type: "NEW_BRANCH", signal_strength: "HIGH", detected_at: today(), description: "", source_url: "", quantity: "", company: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = companyId ?? Number(companies?.find((c) => c.label === v.company)?.id);
    if (!cid) return setMsg({ ok: false, text: "Choose a company from the list" });
    const { ok, data } = await send("/api/admin/signals", "POST", { ...v, company_id: cid });
    if (!ok) return setMsg({ ok: false, text: data.error });
    setMsg({ ok: true, text: `Signal created. Score recalculated: ${data.score.score} (${data.score.level}).` });
    setV({ ...v, description: "", source_url: "", quantity: "" });
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="signal-create-form">
      <div className="grid gap-2 sm:grid-cols-3">
        {companies && (
          <>
            <input className="input sm:col-span-3" list="company-options" placeholder="Company (type to search)…" value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} />
            <datalist id="company-options">{companies.map((c) => <option key={c.id} value={c.label} />)}</datalist>
          </>
        )}
        <SignalFields v={v} setV={setV} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" data-testid="signal-create">Add signal</button>
        {msg && <Msg {...msg} />}
      </div>
    </form>
  );
}

export function SignalRowEditor({ s, showCompany }: { s: SignalRow & { company_label?: string }; showCompany?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<Record<string, string>>({
    signal_type: s.signal_type, signal_strength: s.signal_strength, detected_at: s.detected_at.slice(0, 10), description: s.description, source_url: s.source_url ?? "", quantity: s.quantity ? String(s.quantity) : "",
  });
  const [err, setErr] = useState<string | null>(null);
  if (editing)
    return (
      <li className="space-y-2 rounded-lg bg-slate-50 p-3">
        <div className="grid gap-2 sm:grid-cols-3"><SignalFields v={v} setV={setV} /></div>
        <div className="flex items-center gap-2">
          <button
            className="btn-primary btn-sm"
            onClick={async () => {
              const { ok, data } = await send(`/api/admin/signals/${s.id}`, "PATCH", v);
              if (!ok) return setErr(data.error);
              setEditing(false);
              router.refresh();
            }}
          >
            <Save size={13} /> Save
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}><X size={13} /> Cancel</button>
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      </li>
    );
  return (
    <li className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start">
      <span className="w-24 shrink-0 text-xs tabular-nums text-slate-500">{s.detected_at.slice(0, 10)}</span>
      <div className="flex w-40 shrink-0 flex-wrap gap-1"><SignalTypeBadge type={s.signal_type} /><StrengthBadge strength={s.signal_strength} /></div>
      <div className="min-w-0 flex-1 text-sm text-slate-700">
        {showCompany && s.company_label && <Link href={`/admin/companies/${s.company_id}`} className="mr-1 font-medium text-slate-900 hover:text-brand-700">{s.company_label}:</Link>}
        {s.description}
        <span className="ml-2 text-xs text-slate-400">({s.created_by}{s.observation_id ? ` · obs #${s.observation_id}` : ""})</span>
      </div>
      <div className="flex shrink-0 gap-1">
        <button className="btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label="Edit signal"><Pencil size={13} /></button>
        <button
          className="btn-ghost btn-sm text-red-600"
          aria-label="Delete signal"
          onClick={async () => {
            if (!confirm("Delete this signal? The company score will be recalculated.")) return;
            await send(`/api/admin/signals/${s.id}`, "DELETE");
            router.refresh();
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

// ---------------- Observation ingestion (signal engine demo) ----------------
const OBS_EXAMPLES: Record<string, string> = {
  JOB_POSTING: "Tuyển 10 Nhân viên Kinh doanh (Sales Executive) cho chi nhánh mới",
  NEWS: "Công ty khai trương chi nhánh thứ ba tại Đà Nẵng",
  WEBSITE_SCAN: "Website scan: status=200; quality_score=34; mobile_friendly=no; https=no; online_booking=no; ecommerce=no; last_updated=2018",
  SOCIAL_PRESENCE: "Social presence check: facebook_page=yes; facebook_followers=12000; follower_growth_90d=45%; linkedin_page=no; google_business_profile=no; new_channels=TikTok Shop",
  COMPANY_REGISTRY: "Registered a new branch office (chi nhánh) in Thu Duc City",
};

export function ObservationForm({ companyId }: { companyId: number }) {
  const router = useRouter();
  const [type, setType] = useState("JOB_POSTING");
  const [text, setText] = useState(OBS_EXAMPLES.JOB_POSTING);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string; signals?: { signal_type: string; signal_strength: string; description: string }[] } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { ok, data } = await send("/api/admin/observations", "POST", { company_id: companyId, observation_type: type, raw_text: text, source_url: url || undefined });
    if (!ok) return setResult({ ok: false, text: data.error });
    setResult({ ok: true, text: `Observation #${data.observation_id} processed → ${data.signals.length} signal(s). New score: ${data.score.score} (${data.score.level}).`, signals: data.signals });
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="observation-form">
      <div className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)]">
        <select className="input" value={type} onChange={(e) => { setType(e.target.value); setText(OBS_EXAMPLES[e.target.value] ?? ""); }}>
          {OBSERVATION_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input className="input" placeholder="Public source URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <textarea className="input font-mono text-xs" rows={3} value={text} onChange={(e) => setText(e.target.value)} data-testid="observation-text" />
      <button className="btn-primary" data-testid="observation-submit"><Play size={14} /> Run signal engine</button>
      {result && (
        <div className="space-y-2">
          <Msg ok={result.ok} text={result.text} />
          {result.signals?.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <SignalTypeBadge type={s.signal_type} /> <StrengthBadge strength={s.signal_strength} /> <span className="text-slate-600">{s.description}</span>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}

// ---------------- Data sources ----------------
const LEGAL = ["PENDING", "APPROVED", "REJECTED", "NOT_REQUIRED"];
const ROBOTS = ["PENDING", "ALLOWED", "DISALLOWED", "NOT_APPLICABLE"];
const TYPES = ["DEMO", "REGISTRY", "JOB_BOARD", "NEWS", "WEBSITE", "MANUAL", "CSV_IMPORT", "OPEN_DATA"];

const statusTone = (s: string) => (["APPROVED", "ALLOWED", "NOT_REQUIRED", "NOT_APPLICABLE"].includes(s) ? "green" : ["REJECTED", "DISALLOWED"].includes(s) ? "red" : "amber");

export function SourcesManager({ sources, counts }: { sources: DataSourceRow[]; counts: Record<number, number> }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nv, setNv] = useState({ source_name: "", source_type: "OPEN_DATA", base_url: "", description: "" });

  async function patch(id: number, body: Record<string, unknown>) {
    setErr(null);
    const { ok, data } = await send(`/api/admin/sources/${id}`, "PATCH", body);
    if (!ok) setErr(data.error);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {err && <Msg ok={false} text={err} />}
      <div className="card relative overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="sources-table">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-th">Source</th>
              <th className="table-th">Data type</th>
              <th className="table-th">Public URL</th>
              <th className="table-th">Last update</th>
              <th className="table-th">Legal review</th>
              <th className="table-th">Robots review</th>
              <th className="table-th">Records</th>
              <th className="table-th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sources.map((s) => (
              <tr key={s.id}>
                <td className="table-td min-w-[220px]">
                  <p className="font-medium text-slate-900">{s.source_name}</p>
                  {s.description && <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>}
                  {s.rate_limit_per_minute && <p className="mt-0.5 text-[11px] text-slate-400">Rate limit: {s.rate_limit_per_minute} req/min</p>}
                </td>
                <td className="table-td"><Badge tone="slate">{s.source_type}</Badge></td>
                <td className="table-td text-xs">{s.base_url ? <a className="link break-all" href={s.base_url} target="_blank" rel="noopener noreferrer nofollow">{s.base_url}</a> : "—"}</td>
                <td className="table-td whitespace-nowrap text-xs text-slate-500">{s.last_crawled_at ? s.last_crawled_at.slice(0, 10) : "never"}</td>
                <td className="table-td">
                  <select aria-label="Legal review status" className="input py-1 text-xs" value={s.legal_review_status} onChange={(e) => patch(s.id, { legal_review_status: e.target.value, is_active: e.target.value === "APPROVED" || e.target.value === "NOT_REQUIRED" ? s.is_active : 0 })}>
                    {LEGAL.map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <Badge tone={statusTone(s.legal_review_status)} className="mt-1">{s.legal_review_status}</Badge>
                </td>
                <td className="table-td">
                  <select aria-label="Robots review status" className="input py-1 text-xs" value={s.robots_review_status} onChange={(e) => patch(s.id, { robots_review_status: e.target.value, is_active: ["PENDING", "DISALLOWED"].includes(e.target.value) ? 0 : s.is_active })}>
                    {ROBOTS.map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <Badge tone={statusTone(s.robots_review_status)} className="mt-1">{s.robots_review_status}</Badge>
                </td>
                <td className="table-td tabular-nums text-slate-600">{counts[s.id] ?? 0}</td>
                <td className="table-td">
                  <button data-testid={`toggle-source-${s.id}`} onClick={() => patch(s.id, { is_active: s.is_active ? 0 : 1 })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                    {s.is_active ? "Active" : "Disabled"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding ? (
        <form
          className="card card-pad grid gap-2 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const { ok, data } = await send("/api/admin/sources", "POST", nv);
            if (!ok) return setErr(data.error);
            setAdding(false);
            setNv({ source_name: "", source_type: "OPEN_DATA", base_url: "", description: "" });
            router.refresh();
          }}
        >
          <input className="input" placeholder="Source name" required value={nv.source_name} onChange={(e) => setNv({ ...nv, source_name: e.target.value })} />
          <select className="input" value={nv.source_type} onChange={(e) => setNv({ ...nv, source_type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <input className="input" placeholder="Base URL (https://…)" value={nv.base_url} onChange={(e) => setNv({ ...nv, base_url: e.target.value })} />
          <input className="input" placeholder="Description / terms notes" value={nv.description} onChange={(e) => setNv({ ...nv, description: e.target.value })} />
          <p className="text-xs text-slate-500 sm:col-span-2">New sources start Disabled with legal + robots review PENDING. They can only be activated after review.</p>
          <div className="flex gap-2"><button className="btn-primary">Add source</button><button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      ) : (
        <button className="btn-secondary" onClick={() => setAdding(true)}>+ Register a data source</button>
      )}
    </div>
  );
}

// ---------------- CSV import ----------------
interface Report {
  dryRun: boolean;
  totalRows: number;
  inserted: { row: number; id?: number; company_name: string; score?: number; level?: string }[];
  duplicates: { row: number; company_name: string; reason: string }[];
  invalid: { row: number; company_name: string; errors: string[] }[];
  unknownColumns: string[];
  normalized: { row: number; field: string; from: string; to: string }[];
}

export function ImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/admin/import${dryRun ? "?dryRun=1" : ""}`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Import failed");
      setReport(data.report ?? null);
      return;
    }
    setReport(data.report);
    if (!dryRun) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card card-pad space-y-3">
        <p className="text-sm text-slate-600">
          Columns: <code className="rounded bg-slate-100 px-1 text-xs">company_name, tax_code, industry, province, address, website, employee_range</code> (optional: short_name, district,
          business_description, founded_date). UTF-8, max 2 MB.{" "}
          <a href="/samples/companies-sample.csv" download className="link">Download sample CSV</a>
        </p>
        <input data-testid="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); }} className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700" />
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={!file || busy} onClick={() => run(true)} data-testid="csv-validate">Validate only (dry run)</button>
          <button className="btn-primary" disabled={!file || busy} onClick={() => run(false)} data-testid="csv-import">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Import companies
          </button>
        </div>
        {error && <Msg ok={false} text={error} />}
      </div>
      {report && (
        <div className="space-y-4" data-testid="import-report">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Rows read", report.totalRows],
              [report.dryRun ? "Would insert" : "Inserted", report.inserted.length],
              ["Duplicates skipped", report.duplicates.length],
              ["Invalid rows", report.invalid.length],
            ].map(([k, n]) => (
              <div key={k} className="card card-pad"><p className="text-xs text-slate-500">{k}</p><p className="text-2xl font-semibold tabular-nums">{n}</p></div>
            ))}
          </div>
          {report.inserted.length > 0 && (
            <div className="card card-pad">
              <h3 className="h2 mb-2">{report.dryRun ? "Valid rows (not yet inserted)" : "Inserted & scored"}</h3>
              <ul className="space-y-1 text-sm">
                {report.inserted.map((r) => (
                  <li key={r.row}>
                    <span className="text-xs text-slate-400">row {r.row} · </span>
                    {r.id ? <Link href={`/companies/${r.id}`} className="link">{r.company_name}</Link> : r.company_name}
                    {r.score != null && <span className="ml-2 text-xs text-slate-500">score {r.score} ({r.level})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.normalized.length > 0 && (
            <div className="card card-pad">
              <h3 className="h2 mb-2">Normalised values</h3>
              <ul className="space-y-0.5 text-xs text-slate-600">
                {report.normalized.map((n, i) => <li key={i}>row {n.row} · {n.field}: “{n.from}” → <b>{n.to}</b></li>)}
              </ul>
            </div>
          )}
          {report.duplicates.length > 0 && (
            <div className="card card-pad">
              <h3 className="h2 mb-2">Duplicates removed</h3>
              <ul className="space-y-0.5 text-sm text-slate-600">{report.duplicates.map((d) => <li key={d.row}>row {d.row} · {d.company_name} — {d.reason}</li>)}</ul>
            </div>
          )}
          {report.invalid.length > 0 && (
            <div className="card card-pad">
              <h3 className="h2 mb-2">Invalid rows</h3>
              <ul className="space-y-1 text-sm text-red-700">{report.invalid.map((d) => <li key={d.row}>row {d.row} · {d.company_name}: {d.errors.join("; ")}</li>)}</ul>
            </div>
          )}
          {report.unknownColumns.length > 0 && <p className="text-xs text-slate-500">Ignored columns: {report.unknownColumns.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

export function AdminAnalyzeButton({ companyId }: { companyId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="btn-secondary"
        disabled={busy}
        data-testid="admin-analyze"
        onClick={async () => {
          setBusy(true);
          const { ok, data } = await send("/api/admin/recalculate", "POST", { companyId, ai: true });
          setBusy(false);
          setMsg(ok ? `Score ${data.score.score} (${data.score.level}) · narrative by ${data.generated_by}` : data.error);
          router.refresh();
        }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run AI analysis
      </button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </div>
  );
}
