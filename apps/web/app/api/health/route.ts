import { connection } from "next/server";
import { pingDatabase } from "@/lib/db/ping";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

async function check(): Promise<boolean> {
  // Marks the route as request-time only, so it is never prerendered at build time.
  await connection();
  try {
    await pingDatabase();
    return true;
  } catch (error) {
    // Details stay in the server log; the response only says whether the database answered.
    console.error("[health] database check failed", describe(error));
    return false;
  }
}

type ErrorLike = { code?: unknown; message?: unknown; cause?: unknown };

// Only `code` and `message`, for the error and its cause (drizzle wraps the pg error): pg errors
// carry `client`, whose connection parameters include the password.
function describe(error: unknown) {
  const { code, message, cause } = (error ?? {}) as ErrorLike;
  const inner = (cause ?? {}) as ErrorLike;
  return { code, message, cause: cause ? { code: inner.code, message: inner.message } : undefined };
}

export async function GET() {
  const ok = await check();
  return Response.json({ status: ok ? "ok" : "unavailable" }, { status: ok ? 200 : 503, headers: HEADERS });
}

export async function HEAD() {
  const ok = await check();
  return new Response(null, { status: ok ? 200 : 503, headers: HEADERS });
}
