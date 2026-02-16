import { useState, useEffect } from 'react'

type DailyAccess = {
  date: string
  count: number
}

type AnalyticsData = {
  shortCode: string
  originalUrl: string
  totalAccessCount: number
  createdAt: string
  expiresAt: string | null
  dailyAccess: DailyAccess[]
}

export function useAnalytics(shortCode: string | undefined) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!shortCode) {
      setLoading(false)
      setError('No short code provided')
      return
    }

    const abortController = new AbortController()

    const fetchAnalytics = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(`/api/analytics/${shortCode}`, {
          signal: abortController.signal,
        })

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Short code not found')
          }
          throw new Error('Failed to fetch analytics')
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchAnalytics()

    return () => abortController.abort()
  }, [shortCode])

  return { data, error, loading }
}
