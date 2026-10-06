"use client";

import { Bookmark, BookmarkCheck, Check, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface ListInfo {
  id: number;
  name: string;
  count: number;
  has: boolean;
}

export function SaveButton({ companyId, initialSaved, size = "sm" }: { companyId: number; initialSaved: boolean; size?: "sm" | "md" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [lists, setLists] = useState<ListInfo[] | null>(null);
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setSaved(initialSaved), [initialSaved]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function load() {
    const res = await fetch(`/api/saved?companyId=${companyId}`);
    const data = await res.json();
    setLists(data.lists);
    setSaved(data.lists.some((l: ListInfo) => l.has));
  }

  async function toggle(l: ListInfo) {
    setBusy(l.id);
    await fetch(`/api/lists/${l.id}/companies${l.has ? `?companyId=${companyId}` : ""}`, {
      method: l.has ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: l.has ? undefined : JSON.stringify({ companyId }),
    });
    await load();
    setBusy(null);
    router.refresh();
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy("new");
    const res = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim(), companyId }) });
    if (res.ok) setNewName("");
    await load();
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        data-testid={`save-${companyId}`}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        className={size === "md" ? (saved ? "btn-secondary border-brand-300 text-brand-700" : "btn-secondary") : `rounded-md p-1.5 ${saved ? "text-brand-600" : "text-slate-400 hover:text-slate-700"} hover:bg-slate-100`}
        title={saved ? "Saved — manage lists" : "Save to a lead list"}
        aria-label={saved ? "Saved — manage lists" : "Save to a lead list"}
      >
        {saved ? <BookmarkCheck size={size === "md" ? 16 : 18} /> : <Bookmark size={size === "md" ? 16 : 18} />}
        {size === "md" && (saved ? "Saved" : "Save lead")}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-lg">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Save to list</p>
          {!lists ? (
            <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
          ) : (
            <ul className="max-h-60 overflow-y-auto">
              {lists.map((l) => (
                <li key={l.id}>
                  <button data-testid={`list-toggle-${l.name}`} onClick={() => toggle(l)} disabled={busy !== null} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${l.has ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"}`}>
                      {busy === l.id ? <Loader2 size={10} className="animate-spin" /> : l.has && <Check size={11} />}
                    </span>
                    <span className="flex-1 truncate text-left">{l.name}</span>
                    <span className="text-xs text-slate-400">{l.count}</span>
                  </button>
                </li>
              ))}
              {lists.length === 0 && <li className="px-2 py-1 text-xs text-slate-500">No lists yet — create one below.</li>}
            </ul>
          )}
          <form onSubmit={createList} className="mt-1 flex gap-1 border-t border-slate-100 pt-2">
            <input data-testid="new-list-name" className="input py-1 text-xs" placeholder="New list name…" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn-primary btn-sm" disabled={busy !== null} aria-label="Create list and save">
              <Plus size={14} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
