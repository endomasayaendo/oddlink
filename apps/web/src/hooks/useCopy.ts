import { useState } from "react";

/** Copies text to the clipboard and reports `copied` for two seconds. */
export function useCopy(onError?: (message: string) => void) {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError?.("Failed to copy to clipboard");
    }
  };

  return { copied, copy };
}
