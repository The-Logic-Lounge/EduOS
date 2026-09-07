import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

type Role = "MANAGEMENT" | "INSTRUCTOR" | "STUDENT";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret");

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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Public marketing homepage must be reachable without a session.
  if (pathname === "/") return NextResponse.next();

  const token = req.cookies.get("eduos_session")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  let role: Role;
  try {
    const { payload } = await jwtVerify(token, secret);
    role = payload.role as Role;
  } catch {
    // Expired or tampered token — clear cookie and redirect to login
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("eduos_session");
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
