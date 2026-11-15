import type { NextRequest } from "next/server";
import type { LinkStatus } from "@/lib/links/link-state";
import { rewriteNotFound } from "@/lib/middleware/utils/rewrite-not-found";

/** A link that existed and was taken out of service on purpose. */
export type GoneStatus = Extract<LinkStatus, { state: "disabled" | "deleted" }>;

/**
 * The response for a disabled or deleted link: currently the same static 404 page (`notFoundPath`)
 * as an unknown code.
 */
export function rewriteGone(req: NextRequest, status: GoneStatus, notFoundPath: string) {
  void status;
  return rewriteNotFound(req, notFoundPath);
}
