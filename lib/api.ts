import { NextResponse } from "next/server";

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
  if (error instanceof AuthError) return fail(error.message, error.status);
  console.error("[api]", error);
  return fail("Something went wrong", 500);
}
