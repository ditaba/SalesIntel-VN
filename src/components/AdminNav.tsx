"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/signals", label: "Signals" },
  { href: "/admin/sources", label: "Data Sources & Compliance" },
  { href: "/admin/import", label: "CSV Import" },
];

export function AdminNav() {
  const p = usePathname();
  return (
    <div className="mb-5">
      <h1 className="h1">Admin</h1>
      <nav className="mt-3 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? p === "/admin" : p.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={clsx("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
