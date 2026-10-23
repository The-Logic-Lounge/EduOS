import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

async function POST_(req: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}

export const POST = route("/api/auth/logout", POST_);
