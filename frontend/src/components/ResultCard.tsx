import { useState } from 'react'
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
      <div className="result-card__url-container">
        <a href={shortUrl} target="_blank" rel="noopener noreferrer" className="result-card__url">
          {shortUrl}
        </a>
        <button onClick={handleCopy} className="result-card__copy-button">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
