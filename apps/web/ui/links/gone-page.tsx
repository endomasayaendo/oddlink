import type { Metadata } from "next";
import { type GoneVariant, goneMessage } from "@/lib/links/gone";
import { ErrorPage } from "@/ui/shared/error-page";

export const goneMetadata: Metadata = {
  title: "Link gone - OddLink",
  robots: { index: false, follow: false },
};

/** The static page behind the 410 for a disabled or deleted link. */
export function GonePage({ variant }: { variant: GoneVariant }) {
  return <ErrorPage code="410" message={goneMessage(variant)} />;
}
