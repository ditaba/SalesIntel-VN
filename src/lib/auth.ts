import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getDb } from "./db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./session";
import type { SessionUser } from "./types";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = getDb().prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(Number(claims.sub)) as SessionUser | undefined;
  return user ?? null;
}

/** For server components/pages: redirect to login when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdminPage(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/?error=admin_only");
  return u;
}

/** For route handlers: returns the user or a 401/403 response. */
export async function apiUser(opts: { admin?: boolean } = {}): Promise<SessionUser | NextResponse> {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (opts.admin && u.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return u;
}

export async function startSession(user: SessionUser) {
  const token = await signSession({ sub: String(user.id), email: user.email, name: user.name, role: user.role });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export function verifyPassword(email: string, password: string): SessionUser | null {
  const row = getDb().prepare("SELECT id, email, name, role, password_hash FROM users WHERE email = ?").get(email.trim().toLowerCase()) as
    | (SessionUser & { password_hash: string })
    | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function createUser(email: string, name: string, password: string): SessionUser {
  const db = getDb();
  const info = db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'user')").run(email.trim().toLowerCase(), name.trim(), bcrypt.hashSync(password, 10));
  const id = Number(info.lastInsertRowid);
  // Every new account starts with an empty default lead list.
  db.prepare("INSERT INTO saved_lists (user_id, name, description) VALUES (?, 'My leads', 'Default list')").run(id);
  return { id, email: email.trim().toLowerCase(), name: name.trim(), role: "user" };
}

export function createPasswordReset(email: string): string | null {
  const db = getDb();
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email.trim().toLowerCase()) as { id: number } | undefined;
  if (!user) return null;
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)").run(user.id, token, new Date(Date.now() + 3600_000).toISOString());
  return token;
}

export function resetPassword(token: string, password: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT id, user_id, expires_at, used FROM password_resets WHERE token = ?").get(token) as
    | { id: number; user_id: number; expires_at: string; used: number }
    | undefined;
  if (!row || row.used || row.expires_at < new Date().toISOString()) return false;
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(bcrypt.hashSync(password, 10), row.user_id);
  db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(row.id);
  return true;
}
