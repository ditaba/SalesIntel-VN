"use client";

import { Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewListForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setName("");
    router.push(`/leads?list=${data.id}`);
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex gap-2">
        <input data-testid="create-list-input" className="input" placeholder='New list, e.g. "High priority October"' value={name} onChange={(e) => setName(e.target.value)} />
        <button data-testid="create-list-btn" className="btn-primary shrink-0" disabled={!name.trim()}>
          <Plus size={15} /> Create
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

export function ListActions({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/lists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: value }) });
    if (res.ok) {
      setEditing(false);
      router.refresh();
    }
  }
  async function remove() {
    if (!confirm(`Delete the list "${name}"? Saved companies stay in the database.`)) return;
    await fetch(`/api/lists/${id}`, { method: "DELETE" });
    router.push("/leads");
    router.refresh();
  }
  if (editing)
    return (
      <form onSubmit={rename} className="flex gap-2">
        <input className="input py-1.5" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <button className="btn-primary btn-sm">Save</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)} aria-label="Cancel"><X size={14} /></button>
      </form>
    );
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`/api/lists/${id}/export`} className="btn-secondary btn-sm"><Download size={14} /> Export CSV</a>
      <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}><Pencil size={14} /> Rename</button>
      <button className="btn-secondary btn-sm text-red-600" onClick={remove} data-testid="delete-list"><Trash2 size={14} /> Delete</button>
    </div>
  );
}

export function RemoveFromList({ listId, companyId }: { listId: number; companyId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      data-testid={`remove-${companyId}`}
      disabled={busy}
      className="btn-ghost btn-sm text-slate-500 hover:text-red-600"
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/lists/${listId}/companies?companyId=${companyId}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      <X size={14} /> Remove
    </button>
  );
}
