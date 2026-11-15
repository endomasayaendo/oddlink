import type { NextRequest } from "next/server";
import type { LinkStatus } from "@/lib/links/link-state";
import { rewriteNotFound } from "@/lib/middleware/utils/rewrite-not-found";

/** A link that existed and was taken out of service on purpose. */
export type GoneStatus = Extract<LinkStatus, { state: "disabled" | "deleted" }>;

/**
 * The response for a disabled or deleted link. `notFoundPath` is the static 404 page the caller
 * would otherwise serve. For now this is the same 404 as an unknown code; #76 turns it into the
 * 410 Gone page from ADR 0002 (and chooses the wording from `status`).
 */
export function rewriteGone(req: NextRequest, status: GoneStatus, notFoundPath: string) {
  void status; // #76
  return rewriteNotFound(req, notFoundPath);
}
