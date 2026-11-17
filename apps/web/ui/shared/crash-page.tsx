"use client";

import { useEffect } from "react";
import { ErrorPage } from "@/ui/shared/error-page";
import { buttonClass } from "@/ui/shared/styles";

type Props = {
  error: unknown;
  retry: () => void;
};

// The fallback for app/error.tsx and app/global-error.tsx: the same fog and rust as the 404s, with a
// retry instead of the way home, since the cause (a DB blip, a dropped connection) is often temporary.
export function CrashPage({ error, retry }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Error boundaries are client components and can't export metadata. React hoists this <title>
  // into <head> ahead of the layout's, so the tab names the failure.
  return (
    <>
      <title>Something went wrong - OddLink</title>
      <ErrorPage
        code="Oops"
        message="Something went wrong. Please try again."
        action={
          <button type="button" onClick={() => retry()} className={`${buttonClass} px-6 py-3`}>
            Try again
          </button>
        }
      />
    </>
  );
}
