import { useEffect, useRef, useState } from "react";

/** Copies text to the clipboard and reports `copied` for two seconds after the latest copy. */
export function useCopy(onError?: (message: string) => void) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // Restart the window so a repeated copy shows "Copied!" for the full two seconds.
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      onError?.("Failed to copy to clipboard");
    }
  };

  return { copied, copy };
}
