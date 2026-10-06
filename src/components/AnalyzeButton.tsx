"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AnalyzeButton({ companyId, label = "Regenerate AI analysis" }: { companyId: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/companies/${companyId}/analyze`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "Analysis failed");
    setMsg(`Updated by ${data.generated_by}`);
    router.refresh();
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={run} disabled={busy} className="btn-secondary" data-testid="analyze-btn">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {busy ? "Analyzing…" : label}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}
