import { useEffect, useRef, useState } from "react";

/** Copies text to the clipboard and reports `copied` for two seconds after the latest successful copy. */
export function useCopy(onError?: (message: string) => void) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The write may settle after unmount; the cleanup already ran, so skip all updates.
      if (!mountedRef.current) return;
      clearTimeout(timeoutRef.current);
      setCopied(false);
      onError?.("Failed to copy to clipboard");
      return;
    }
    if (!mountedRef.current) return;
    setCopied(true);
    // Restart the window so a repeated copy shows "Copied!" for the full two seconds.
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return { copied, copy };
}
