import { useSyncExternalStore } from "react";

// Same key as the Java version's frontend, so existing history carries over.
const STORAGE_KEY = "oddlink_history";
const MAX_ENTRIES = 10;

export type HistoryEntry = {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  createdAt: string;
};

const EMPTY: HistoryEntry[] = [];
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedEntries: HistoryEntry[] = EMPTY;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Must return the same array until storage changes, or React re-renders forever.
function getSnapshot(): HistoryEntry[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      cachedEntries = Array.isArray(parsed) ? parsed : EMPTY;
    } catch {
      cachedEntries = EMPTY;
    }
  }
  return cachedEntries;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function save(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage may be unavailable (private mode, quota); history is a convenience.
  }
  listeners.forEach((listener) => listener());
}

export function useHistory() {
  const history = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const addEntry = (entry: Omit<HistoryEntry, "createdAt">) => {
    const current = getSnapshot();
    save(
      [{ ...entry, createdAt: new Date().toISOString() }, ...current.filter((e) => e.shortCode !== entry.shortCode)].slice(
        0,
        MAX_ENTRIES,
      ),
    );
  };

  const removeEntry = (shortCode: string) => {
    save(getSnapshot().filter((e) => e.shortCode !== shortCode));
  };

  return { history, addEntry, removeEntry };
}
