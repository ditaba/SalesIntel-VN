export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500">
            <svg viewBox="0 0 32 32" width="22" height="22"><path d="M7 22l6-7 5 4 7-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="text-lg font-semibold">SalesIntel <span className="text-brand-300">Vietnam</span></span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Know who to contact, why, and why now.</h1>
          <p className="mt-4 text-slate-300">
            Company intelligence for Vietnamese B2B sales teams. Public business signals — hiring, new branches, expansion, website gaps — turned into a
            transparent Opportunity Score and an AI-written sales angle.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {["Company database with powerful filters", "Business signal engine with source attribution", "Deterministic, auditable Opportunity Score", "AI analysis that separates facts from inference"].map((t) => (
              <li key={t} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand-400" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-500">MVP · all company records are synthetic demo data</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
