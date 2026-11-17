import type { Metadata } from "next";
import { ErrorPage } from "@/ui/shared/error-page";

export const metadata: Metadata = {
  title: "Page not found - OddLink",
};

export default function NotFound() {
  return <ErrorPage code="404" message="Page not found" />;
}
