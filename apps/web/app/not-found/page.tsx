import { ErrorPage } from "@/ui/shared/error-page";

export default function LinkNotFoundPage() {
  return <ErrorPage code="404" message="This link doesn't exist or has expired." />;
}
