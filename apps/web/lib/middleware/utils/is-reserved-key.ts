// Single-segment routes that app/ serves itself. Every other single-segment path
// is treated as a short code, like the old app/[shortCode] route did.
// tests/redirects/reserved-keys.test.ts fails if a new top-level route is missing here.
export const RESERVED_KEYS = new Set(["not-found", "favicon.ico"]);

export function isReservedKey(key: string): boolean {
  return RESERVED_KEYS.has(key);
}
