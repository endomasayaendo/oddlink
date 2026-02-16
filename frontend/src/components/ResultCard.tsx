import { useState } from 'react'
import { Link } from 'react-router-dom'
import './ResultCard.css'

type Props = {
  shortUrl: string
  onError: (message: string) => void
}

export function ResultCard({ shortUrl, onError }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shortUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      onError('Failed to copy to clipboard')
    }
  }

  return (
    <div className="result-card">
      <p className="result-card__label">Your link just got odd:</p>
      <a href={shortUrl} target="_blank" rel="noopener noreferrer" className="result-card__url">
        {shortUrl}
      </a>
      <button onClick={handleCopy} className="result-card__copy-button">
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <Link to={`/analytics/${shortUrl.split('/').pop()}`} className="result-card__analytics-link">
        View Analytics
      </Link>
    </div>
  )
}
