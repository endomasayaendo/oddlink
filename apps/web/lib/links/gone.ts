import type { LinkActor, LinkStatus } from "@/lib/links/link-state";

/** A link that existed and was taken out of service on purpose. */
export type GoneStatus = Extract<LinkStatus, { state: "disabled" | "deleted" }>;

/**
 * One static page per wording, so the gone page stays prerendered: the state, and whether the
 * operator or automation acted (which adds a generic reason) or the owner did (no reason).
 */
export const GONE_VARIANTS = ["disabled", "disabled-flagged", "deleted", "deleted-flagged"] as const;
export type GoneVariant = (typeof GONE_VARIANTS)[number];

/** True when someone other than the owner took the link out of service. */
export const isFlagged = (by: LinkActor) => by !== "owner";

export function goneVariant({ state, by }: GoneStatus): GoneVariant {
  return isFlagged(by) ? `${state}-flagged` : state;
}

// Deliberately generic: it warns whoever clicked without saying how links are checked.
export const FLAGGED_REASON = "because it was reported or flagged as unsafe";

export function goneMessage(variant: GoneVariant): string {
  switch (variant) {
    case "disabled":
      return "This link was disabled.";
    case "disabled-flagged":
      return `This link was disabled ${FLAGGED_REASON}.`;
    case "deleted":
      return "This link was deleted.";
    case "deleted-flagged":
      return `This link was deleted ${FLAGGED_REASON}.`;
    default:
      throw new Error(`Unknown gone variant: ${String(variant satisfies never)}`);
  }
}

export function isGoneVariant(value: string): value is GoneVariant {
  return (GONE_VARIANTS as readonly string[]).includes(value);
}
