import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

const PUBLIC = ["/login", "/register", "/forgot-password", "/reset-password", "/api/auth", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && session.role !== "admin") {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      return NextResponse.redirect(new URL("/?error=admin_only", req.url));
    }
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|samples/).*)"],
};
