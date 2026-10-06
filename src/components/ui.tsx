import clsx from "clsx";
import Link from "next/link";
import { SIGNAL_TYPES, type SignalType } from "@/lib/constants";

const TONES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  pink: "bg-pink-50 text-pink-700 ring-pink-600/20",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  green: "bg-green-50 text-green-700 ring-green-600/20",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
  gray: "bg-gray-50 text-gray-600 ring-gray-500/20",
};

export function Badge({ tone = "slate", children, className, title }: { tone?: string; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx("inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONES[tone] ?? TONES.slate, className)}>
      {children}
    </span>
  );
}

export function SignalTypeBadge({ type }: { type: string }) {
  const meta = SIGNAL_TYPES[type as SignalType];
  return (
    <Badge tone={meta?.tone ?? "slate"} title={meta?.description}>
      {meta?.label ?? type}
    </Badge>
  );
}

export function StrengthBadge({ strength }: { strength: string }) {
  const tone = strength === "HIGH" ? "red" : strength === "MEDIUM" ? "amber" : "gray";
  return <Badge tone={tone}>{strength}</Badge>;
}

export const LEVEL_STYLE: Record<string, { text: string; bg: string; ring: string; bar: string }> = {
  HIGH: { text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-600/25", bar: "bg-emerald-500" },
  MEDIUM: { text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-600/25", bar: "bg-amber-500" },
  LOW: { text: "text-slate-600", bg: "bg-slate-100", ring: "ring-slate-500/20", bar: "bg-slate-400" },
};

/** Compact score: number + level pill + bar. */
export function ScorePill({ score, level }: { score: number; level: string }) {
  const s = LEVEL_STYLE[level] ?? LEVEL_STYLE.LOW;
  return (
    <div className="flex min-w-[96px] items-center gap-2">
      <span className="w-7 text-right text-base font-semibold tabular-nums text-slate-900">{score}</span>
      <div className="flex-1">
        <span className={clsx("inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ring-1 ring-inset", s.bg, s.text, s.ring)}>{level}</span>
        <div className="mt-1 h-1 w-full rounded-full bg-slate-100">
          <div className={clsx("h-1 rounded-full", s.bar)} style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Large circular score gauge for the company page. */
export function ScoreGauge({ score, level }: { score: number; level: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = level === "HIGH" ? "#059669" : level === "MEDIUM" ? "#d97706" : "#94a3b8";
  const s = LEVEL_STYLE[level] ?? LEVEL_STYLE.LOW;
  return (
    <div className="flex flex-col items-center">
      <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`Opportunity score ${score} of 100, ${level}`}>
        <circle cx="66" cy="66" r={r} fill="none" stroke="#eef2f7" strokeWidth="10" />
        <circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 66 66)" />
        <text x="66" y="66" textAnchor="middle" fontSize="34" fontWeight="700" fill="#0f172a" dominantBaseline="central">{score}</text>
        <text x="66" y="92" textAnchor="middle" fontSize="11" fill="#64748b">/ 100</text>
      </svg>
      <span className={clsx("mt-1 rounded-md px-2.5 py-0.5 text-xs font-bold tracking-wider ring-1 ring-inset", s.bg, s.text, s.ring)}>{level}</span>
    </div>
  );
}

export function StatCard({ label, value, hint, href, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; icon?: React.ReactNode }) {
  const body = (
    <div className="card card-pad h-full transition hover:border-brand-300">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function SectionCard({ title, action, children, className, subtitle }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; subtitle?: React.ReactNode }) {
  return (
    <section className={clsx("card", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="h2">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="amber" title="Synthetic sample record generated for the MVP demo - not a real company">
      DEMO DATA
    </Badge>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function relDays(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "—";
  const d = Math.floor((now - new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)} yr ago`;
}
