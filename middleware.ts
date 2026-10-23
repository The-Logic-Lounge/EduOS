import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { authSecret, SESSION_COOKIE } from "@/lib/session-secret";

type Role = "MANAGEMENT" | "INSTRUCTOR" | "STUDENT";


const homeFor: Record<Role, string> = {
  MANAGEMENT: "/management",
  INSTRUCTOR: "/instructor",
  STUDENT: "/student",
};

/** Which roles may access each page prefix. Checked top-down — first match wins. */
const ROUTE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/management", roles: ["MANAGEMENT"] },
  { prefix: "/instructor", roles: ["INSTRUCTOR", "MANAGEMENT"] },
  { prefix: "/courses", roles: ["INSTRUCTOR", "MANAGEMENT"] },
  { prefix: "/student", roles: ["STUDENT"] },
];

/** Remember where the user was going; LoginForm returns them there (same-origin only). */
function toLogin(req: NextRequest) {
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Public marketing homepage must be reachable without a session.
  if (pathname === "/") return NextResponse.next();
  // Public Proof-of-Skill record: employers open it from a passport link without an account.
  if (pathname.startsWith("/verify/")) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return toLogin(req);

  let role: Role;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    role = payload.role as Role;
    // Pre-tenancy session (no org claim): treated as signed out by the app, so clear it here.
    if (!payload.organizationId) throw new Error("legacy session");
  } catch {
    // Expired or tampered token — clear cookie and redirect to login
    const res = toLogin(req);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  for (const { prefix, roles } of ROUTE_ROLES) {
    if (pathname.startsWith(prefix) && !roles.includes(role)) {
      return NextResponse.redirect(new URL(homeFor[role], req.url));
    }
  }

  return NextResponse.next();
}

// API routes self-gate (they must return real 401 JSON), so they are excluded here
// along with /login and static assets.
export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
