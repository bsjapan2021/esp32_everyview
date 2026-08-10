import { NextResponse } from "next/server";
import type { z } from "zod";
import { zodMessage } from "@/lib/validation";

/** Safely parse a JSON request body; returns null on any failure. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "찾을 수 없습니다."): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message = "서버 오류가 발생했습니다."): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * Validate an unknown body against a schema. Returns a discriminated result so
 * callers can early-return the 400 response.
 */
export function validate<T>(
  schema: z.ZodType<T>,
  body: unknown,
):
  | { ok: true; data: T }
  | { ok: false; response: NextResponse } {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: badRequest(zodMessage(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}
