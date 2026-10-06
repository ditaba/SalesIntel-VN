"use client";

import clsx from "clsx";
import { BarChart3, Bookmark, Building2, LogOut, Menu, Radio, Settings2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/types";

const NAV = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/ai-search", label: "AI Search", icon: Sparkles },
  { href: "/leads", label: "Saved Leads", icon: Bookmark },
  { href: "/signals", label: "Signals", icon: Radio },
  { href: "/admin", label: "Admin", icon: Settings2, admin: true },
];

export function AppShell({ user, aiMode, children }: { user: SessionUser; aiMode: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {NAV.filter((n) => !n.admin || user.role === "admin").map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon size={18} strokeWidth={1.8} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
        <svg viewBox="0 0 32 32" width="20" height="20"><path d="M7 22l6-7 5 4 7-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold text-white">SalesIntel</span>
        <span className="block text-[11px] font-medium uppercase tracking-widest text-brand-300">Vietnam</span>
      </span>
    </Link>
  );

  const footer = (
    <div className="border-t border-white/10 p-4">
      <div className="mb-3 rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-snug text-slate-400">
        AI engine: <span className="font-medium text-slate-200">{aiMode}</span>
        <br />
        Data: <span className="font-medium text-amber-300">demo sample dataset</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-slate-400">
            {user.email} · {user.role}
          </p>
        </div>
        <button onClick={logout} className="rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="Log out" aria-label="Log out">
          <LogOut size={17} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-slate-900 lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-slate-900 px-4 py-2 lg:hidden">
        <Link href="/" className="text-sm font-semibold text-white">
          SalesIntel <span className="text-brand-300">Vietnam</span>
        </Link>
        <button onClick={() => setOpen(true)} className="rounded-md p-2 text-slate-200" aria-label="Open menu">
          <Menu size={20} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-900">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 p-1 text-slate-300" aria-label="Close menu">
              <X size={20} />
            </button>
            {brand}
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <main className="lg:pl-60">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
