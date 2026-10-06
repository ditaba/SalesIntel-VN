// Edge-safe JWT session helpers (used by middleware and server code).
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "si_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.AUTH_SECRET || "salesintel-dev-secret-change-me-in-production-0123456789";
  return new TextEncoder().encode(s);
}

export interface SessionClaims {
  sub: string;
  email: string;
  name: string;
  role: "user" | "admin";
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email, name: claims.name, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { sub: String(payload.sub), email: String(payload.email), name: String(payload.name), role: payload.role === "admin" ? "admin" : "user" };
  } catch {
    return null;
  }
}
