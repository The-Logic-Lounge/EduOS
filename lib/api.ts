import { NextResponse } from "next/server";
import { recordEvent } from "./ops";

export type ApiResponse<T> = { success: boolean; data?: T; error?: string };

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function ok<T>(data: T) {
  return NextResponse.json<ApiResponse<T>>({ success: true, data });
}

export function fail(error: string, status = 400) {
  return NextResponse.json<ApiResponse<never>>({ success: false, error }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    // 401/403/404/429 from authorization: counted for the security panel, never the message.
    recordEvent({ kind: "auth", name: "denied", ok: false, status: error.status });
    return fail(error.message, error.status);
  }
  console.error("[api]", error);
  // Class name and Prisma error code only — messages can carry SQL or record values.
  const code = (error as { code?: unknown })?.code;
  recordEvent({
    kind: "error",
    name: error instanceof Error ? error.constructor.name : "UnknownError",
    ok: false,
    status: 500,
    detail: typeof code === "string" ? code : undefined,
  });
  return fail("Something went wrong", 500);
}
