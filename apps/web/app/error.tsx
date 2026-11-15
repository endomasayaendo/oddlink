"use client";

import { CrashPage } from "@/ui/shared/crash-page";

// Catches unexpected errors in every page under the root layout (e.g. the analytics page while the
// DB is down), so they get the storybook look instead of Next.js's default error screen.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <CrashPage error={error} retry={retry} />;
}
