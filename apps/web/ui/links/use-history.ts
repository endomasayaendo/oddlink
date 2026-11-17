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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return isNonEmptyString(entry.shortCode) && isNonEmptyString(entry.shortUrl) && isNonEmptyString(entry.originalUrl);
}

// Keeps well-formed entries (with any extra fields they carry) and drops later duplicates of a shortCode.
export function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (!Array.isArray(parsed)) return EMPTY;
  const seen = new Set<string>();
  const entries: HistoryEntry[] = [];
  for (const item of parsed) {
    if (!isHistoryEntry(item) || seen.has(item.shortCode)) continue;
    seen.add(item.shortCode);
    entries.push(item);
  }
  return entries;
}

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
    cachedEntries = parseHistory(raw);
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
