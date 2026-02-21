import { useState } from 'react'

type ShortenResult = {
  shortUrl: string
  originalUrl: string
}

export function useShorten() {
  const [result, setResult] = useState<ShortenResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const shorten = async (originalUrl: string): Promise<ShortenResult | null> => {
    setError('')
    setResult(null)
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
        let message = 'Failed to shorten URL'
        try {
          const errorData = await response.json()
          if (errorData.message) message = errorData.message
        } catch { /* レスポンスがJSONでない場合はデフォルトメッセージを使用 */ }
        throw new Error(message)
      }

      const data = await response.json()
      const shortenResult = { shortUrl: data.shortUrl, originalUrl }
      setResult(shortenResult)
      return shortenResult
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { result, error, loading, shorten, setError }
}
