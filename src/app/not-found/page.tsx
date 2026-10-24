import { ErrorPage } from "@/components/ErrorPage";

export default function LinkNotFoundPage() {
  return <ErrorPage code="404" message="This link doesn't exist or has expired." />;
}
