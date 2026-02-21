import { useState } from 'react'

const STORAGE_KEY = 'oddlink_history'
const MAX_ENTRIES = 10

export type HistoryEntry = {
  shortCode: string
  shortUrl: string
  originalUrl: string
  createdAt: string
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)

  const addEntry = (entry: Omit<HistoryEntry, 'createdAt'>) => {
    setHistory((prev) => {
      const next = [
        { ...entry, createdAt: new Date().toISOString() },
        ...prev.filter((e) => e.shortCode !== entry.shortCode),
      ].slice(0, MAX_ENTRIES)
      saveHistory(next)
      return next
    })
  }

  const removeEntry = (shortCode: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.shortCode !== shortCode)
      saveHistory(next)
      return next
    })
  }

  return { history, addEntry, removeEntry }
}
