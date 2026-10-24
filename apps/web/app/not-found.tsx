import { ErrorPage } from "@/ui/shared/error-page";

export default function NotFound() {
  return <ErrorPage code="404" message="Page not found" />;
}
