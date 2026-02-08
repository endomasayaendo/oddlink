import { useState } from 'react'
import './UrlForm.css'

type Props = {
  onSubmit: (url: string) => void
  loading: boolean
}

export function UrlForm({ onSubmit, loading }: Props) {
  const [originalUrl, setOriginalUrl] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(originalUrl)
  }

  return (
    <form onSubmit={handleSubmit} className="url-form">
      <input
        type="url"
        value={originalUrl}
        onChange={(e) => setOriginalUrl(e.target.value)}
        placeholder="Enter your URL here..."
        required
        className="url-form__input"
      />
      <button type="submit" disabled={loading} className="url-form__button">
        {loading ? 'Shortening...' : 'Shorten'}
      </button>
    </form>
  )
}
