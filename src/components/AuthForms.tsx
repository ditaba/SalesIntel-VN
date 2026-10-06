"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent, creds?: { email: string; password: string }) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { ok, data } = await post("/api/auth/login", creds ?? { email, password });
    setLoading(false);
    if (!ok) return setError(data.error ?? "Login failed");
    const next = params.get("next");
    router.push(next && next.startsWith("/") ? next : "/");
    router.refresh();
  }

  return (
    <div>
      <h1 className="h1">Sign in</h1>
      <p className="muted mt-1">Welcome back to SalesIntel Vietnam.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="text-xs text-brand-700 hover:underline">Forgot password?</Link>
          </div>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <ErrorBox msg={error} />
        <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Signing in…" : "Sign in"}</button>
      </form>
      <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">Demo accounts</p>
        <div className="mt-2 space-y-2 text-sm">
          <button type="button" data-testid="demo-user" onClick={(e) => submit(e, { email: "demo@salesintel.vn", password: "demo1234" })} className="btn-secondary w-full justify-between">
            <span>Sales rep</span><span className="font-mono text-xs text-slate-500">demo@salesintel.vn / demo1234</span>
          </button>
          <button type="button" data-testid="demo-admin" onClick={(e) => submit(e, { email: "admin@salesintel.vn", password: "admin1234" })} className="btn-secondary w-full justify-between">
            <span>Admin</span><span className="font-mono text-xs text-slate-500">admin@salesintel.vn / admin1234</span>
          </button>
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        No account? <Link href="/register" className="link">Create one</Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { ok, data } = await post("/api/auth/register", form);
    setLoading(false);
    if (!ok) return setError(data.error ?? "Registration failed");
    router.push("/");
    router.refresh();
  }

  return (
    <div>
      <h1 className="h1">Create your account</h1>
      <p className="muted mt-1">Start finding Vietnamese prospects in minutes.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password (min. 8 characters)</label>
          <input id="password" type="password" required minLength={8} autoComplete="new-password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <ErrorBox msg={error} />
        <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Creating account…" : "Create account"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account? <Link href="/login" className="link">Sign in</Link>
      </p>
    </div>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ message: string; resetUrl?: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await post("/api/auth/forgot", { email });
    setResult(data);
  }
  return (
    <div>
      <h1 className="h1">Reset password</h1>
      <p className="muted mt-1">Enter your account email and we&apos;ll create a reset link.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input type="email" required placeholder="you@company.vn" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-primary w-full">Send reset link</button>
      </form>
      {result && (
        <div className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          {result.message}
          {result.resetUrl && (
            <p className="mt-2">
              <span className="text-xs text-slate-500">Demo mode (no email server): </span>
              <Link href={result.resetUrl} className="link">Open reset link</Link>
            </p>
          )}
        </div>
      )}
      <p className="mt-6 text-center text-sm"><Link href="/login" className="link">Back to sign in</Link></p>
    </div>
  );
}

export function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { ok, data } = await post("/api/auth/reset", { token: params.get("token"), password });
    if (!ok) return setError(data.error ?? "Reset failed");
    setDone(true);
    setTimeout(() => router.push("/login"), 1200);
  }
  return (
    <div>
      <h1 className="h1">Choose a new password</h1>
      {done ? (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Password updated. Redirecting to sign in…</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input type="password" required minLength={8} placeholder="New password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          <ErrorBox msg={error} />
          <button className="btn-primary w-full">Update password</button>
        </form>
      )}
    </div>
  );
}
