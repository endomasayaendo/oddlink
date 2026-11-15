import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { urlMappings } from "@/lib/db/schema";
import { linkState, type LinkStatus, toLinkStatus } from "@/lib/links/link-state";
import { toRedirectUrl } from "@/lib/links/resolve-link";

export type LinkPreview =
  | {
      state: "active" | "expired";
      shortCode: string;
      /** The parsed destination: always http(s) without userinfo, i.e. what a redirect would use. */
      target: URL;
      createdAt: Date;
      expiresAt: Date | null;
      accessCount: number;
    }
  /** Taken out of service: no destination, whoever disabled or deleted it. */
  | (Extract<LinkStatus, { state: "disabled" | "deleted" }> & { shortCode: string });

/**
 * Read-only lookup behind the `+` preview: never counts or logs an access.
 * Returns null when the code is unknown or the stored URL isn't one a redirect would follow
 * (`toRedirectUrl` rejects it), so a preview never shows a destination the link wouldn't go to.
 * Expired links are returned with `state: "expired"` (from `linkState`, against the same clock the
 * redirect uses) so callers can explain instead of 404. Disabled and deleted links never carry
 * their destination.
 */
export async function getLinkPreview(shortCode: string): Promise<LinkPreview | null> {
  const [row] = await db
    .select({
      state: linkState,
      disabledBy: urlMappings.disabledBy,
      deletedBy: urlMappings.deletedBy,
      shortCode: urlMappings.shortCode,
      originalUrl: urlMappings.originalUrl,
      createdAt: urlMappings.createdAt,
      expiresAt: urlMappings.expiresAt,
      accessCount: urlMappings.accessCount,
    })
    .from(urlMappings)
    .where(eq(urlMappings.shortCode, shortCode));
  if (!row) return null;

  const status = toLinkStatus(row.state, row.disabledBy, row.deletedBy);
  if (status.state === "disabled" || status.state === "deleted") return { ...status, shortCode: row.shortCode };

  // Not deleted, so the url_unless_deleted CHECK guarantees a URL; the null check is for the type.
  const target = row.originalUrl === null ? null : toRedirectUrl(row.originalUrl);
  if (!target) return null;

  return {
    state: status.state,
    shortCode: row.shortCode,
    target,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    accessCount: row.accessCount,
  };
}
