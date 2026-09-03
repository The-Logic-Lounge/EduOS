import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (req.cookies.get("eduos_session")) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

// API routes self-gate (they must return real 401 JSON), so they are excluded here
// along with /login and static assets.
export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
