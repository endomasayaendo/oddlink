import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { HistoryEntry } from '../hooks/useHistory'
import './HistoryList.css'

type Props = {
  history: HistoryEntry[]
  onRemove: (shortCode: string) => void
}

function truncate(url: string, max: number): string {
  return url.length > max ? url.slice(0, max) + '…' : url
}

function HistoryItem({
  entry,
  onRemove,
}: {
  entry: HistoryEntry
  onRemove: (shortCode: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(entry.shortUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <li className="history-list__item">
      <div className="history-list__urls">
        <a
          href={entry.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="history-list__short-url"
        >
          {entry.shortUrl}
        </a>
        <span className="history-list__original-url">
          {truncate(entry.originalUrl, 50)}
        </span>
      </div>
      <div className="history-list__actions">
        <Link
          to={`/analytics/${entry.shortCode}`}
          className="history-list__analytics-button"
        >
          Analytics
        </Link>
        <button onClick={handleCopy} className="history-list__copy-button">
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={() => onRemove(entry.shortCode)}
          className="history-list__remove-button"
          aria-label="Remove"
        >
          ×
        </button>
      </div>
    </li>
  )
}

export function HistoryList({ history, onRemove }: Props) {
  if (history.length === 0) return null

  return (
    <div className="history-list">
      <p className="history-list__title">Recent links</p>
      <ul className="history-list__items">
        {history.map((entry) => (
          <HistoryItem key={entry.shortCode} entry={entry} onRemove={onRemove} />
        ))}
      </ul>
    </div>
  )
}
