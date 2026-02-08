import { useState } from 'react'

export function useShorten() {
  const [shortUrl, setShortUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const shorten = async (originalUrl: string) => {
    setError('')
    setShortUrl('')
    setLoading(true)

    try {
      const response = await fetch('/api/issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ originalUrl }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to shorten URL')
      }

      const resultUrl = await response.text()
      setShortUrl(resultUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return { shortUrl, error, loading, shorten, setError }
}
