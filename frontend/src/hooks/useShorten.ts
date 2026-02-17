import { useState } from 'react'

export function useShorten() {
  const [shortUrl, setShortUrl] = useState(() => sessionStorage.getItem('shortUrl') || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const shorten = async (originalUrl: string) => {
    setError('')
    setShortUrl('')
    sessionStorage.removeItem('shortUrl')
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
      setShortUrl(data.shortUrl)
      sessionStorage.setItem('shortUrl', data.shortUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return { shortUrl, error, loading, shorten, setError }
}
