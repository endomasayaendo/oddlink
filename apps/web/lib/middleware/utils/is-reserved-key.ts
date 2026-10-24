// Top-level routes in app/. A short code can never be one of these.
const RESERVED_KEYS = new Set(["analytics", "not-found", "api"]);

/** Paths the link middleware must leave to the app: its own routes and Next.js internals. */
export function isReservedKey(key: string): boolean {
  return RESERVED_KEYS.has(key) || key.startsWith("_");
}
