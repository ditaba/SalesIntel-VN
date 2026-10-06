"use client";

import { ArrowUp, Loader2, Sparkles, Table2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PROVINCES } from "@/lib/constants";
import { badgesFor } from "@/lib/search";
import type { CompanyListRow } from "@/lib/types";
import { SaveButton } from "./SaveButton";
import { Badge, ScorePill } from "./ui";

interface Turn {
  question: string;
  loading?: boolean;
  error?: string;
  answer?: string;
  interpretation?: string[];
  parser?: string;
  relaxed?: string[];
  total?: number;
  filtersQuery?: string;
  rows?: CompanyListRow[];
  savedIds?: number[];
}

const EXAMPLES = [
  "Find salons in Ho Chi Minh City that may need a new website.",
  "Find beauty salons in Ho Chi Minh City that recently expanded and have weak websites.",
  "Find manufacturing companies in Binh Duong with more than 50 employees that are currently hiring.",
  "Show the 20 best prospects for selling website development services.",
  "Which companies should I contact today?",
  "Clinics in Hanoi hiring marketing staff",
];

function ResultList({ t }: { t: Turn }) {
  if (!t.rows?.length) return null;
  return (
    <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="ai-results">
      {t.rows.map((c, i) => (
        <li key={c.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4">
          <span className="hidden w-5 pt-0.5 text-xs tabular-nums text-slate-400 sm:block">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2">
              <Link href={`/companies/${c.id}`} className="font-semibold text-slate-900 hover:text-brand-700" data-testid="ai-result-link">{c.short_name || c.company_name}</Link>
              <span className="text-xs text-slate-500">
                {c.industry} · {c.district ? `${c.district}, ` : ""}{PROVINCES[c.province]?.short ?? c.province} · {c.estimated_employee_range} emp.
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {badgesFor(c).map((b) => <Badge key={b.key} tone={b.tone}>{b.label}</Badge>)}
            </div>
            {c.ai_why_now && <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{c.ai_why_now}</p>}
          </div>
          <div className="flex items-center gap-2">
            <ScorePill score={c.ai_opportunity_score} level={c.ai_opportunity_level} />
            <SaveButton companyId={c.id} initialSaved={!!t.savedIds?.includes(c.id)} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AISearch() {
  const params = useSearchParams();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  async function ask(question: string) {
    if (!question.trim()) return;
    setInput("");
    setTurns((t) => [...t, { question, loading: true }]);
    try {
      const res = await fetch("/api/ai-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const data = await res.json();
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? (res.ok ? { ...data, question } : { question, error: data.error ?? "Search failed" }) : x)));
    } catch {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { question, error: "Network error" } : x)));
    }
  }

  useEffect(() => {
    const q = params.get("q");
    if (q && !ran.current) {
      ran.current = true;
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="h1 flex items-center gap-2"><Sparkles className="text-brand-600" size={22} /> AI Search</h1>
        <p className="muted mt-1">Ask in plain English (or Vietnamese keywords). Your request is translated into database filters — every result is a real record from the database.</p>
      </div>

      {turns.length === 0 && (
        <div className="card card-pad">
          <p className="text-sm font-medium text-slate-700">Try one of these</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => ask(e)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:bg-brand-50/50" data-testid="ai-example">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {turns.map((t, i) => (
          <div key={i} className="space-y-3">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white">{t.question}</p>
            </div>
            <div className="card card-pad">
              {t.loading ? (
                <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Translating your request into filters and searching…</p>
              ) : t.error ? (
                <p className="text-sm text-red-600">{t.error}</p>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-slate-800" data-testid="ai-answer">{t.answer}</p>
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Interpreted as filters <span className="font-normal normal-case">· parser: {t.parser === "rules" ? "rules engine" : t.parser}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="ai-filters">
                      {t.interpretation?.map((x) => (
                        <span key={x} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">{x}</span>
                      ))}
                    </div>
                  </div>
                  <ResultList t={t} />
                  {t.filtersQuery !== undefined && (t.total ?? 0) > 0 && (
                    <Link href={`/companies?${t.filtersQuery}`} className="mt-3 inline-flex items-center gap-1.5 text-sm link">
                      <Table2 size={15} /> Open all {t.total} results in the Companies table
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-4 mt-6"
      >
        <div className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-lg focus-within:border-brand-500">
          <input
            data-testid="ai-input"
            className="flex-1 border-0 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-slate-400"
            placeholder="e.g. Find restaurants in Da Nang that opened a new branch and have no website"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn-primary h-9 w-9 rounded-xl p-0" aria-label="Send" disabled={!input.trim()}>
            <ArrowUp size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
