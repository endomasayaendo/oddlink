import { GonePage, goneMetadata } from "@/ui/links/gone-page";

// The proxy answers links the operator or automation disabled with this page and a 410.
export const metadata = goneMetadata;

export default function Page() {
  return <GonePage variant="disabled-flagged" />;
}
