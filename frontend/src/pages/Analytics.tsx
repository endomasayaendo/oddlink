import { useParams, Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useAnalytics } from '../hooks/useAnalytics'
import './Analytics.css'

function formatDate(isoString: string | null): string {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function Analytics() {
  const { shortCode } = useParams<{ shortCode: string }>()
  const { data, error, loading } = useAnalytics(shortCode)

  if (loading) {
    return <div className="analytics__loading">Loading...</div>
  }

  if (error || !data) {
    const isNotFound = error === 'Short code not found'
    return (
      <div className="analytics__error">
        <p className="analytics__error-code">{isNotFound ? '404' : 'Error'}</p>
        <p className="analytics__error-message">{error || 'Analytics not found'}</p>
        <Link to="/" className="analytics__back-link">
          Back to OddLink
        </Link>
      </div>
    )
  }

  const chartData = data.dailyAccess.map((d) => {
    const [year, month, day] = d.date.split('-').map(Number)
    const localDate = new Date(year, month - 1, day)
    return {
      date: localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: d.count,
    }
  })

  return (
    <div className="analytics">
      <div className="analytics__header">
        <Link to="/" className="analytics__logo">
          OddLink
        </Link>
      </div>

      <a
        href={data.originalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="analytics__original-url"
      >
        {data.originalUrl}
      </a>

      <div className="analytics__stats">
        <div className="analytics__stat-card">
          <p className="analytics__stat-label">Total Clicks</p>
          <p className="analytics__stat-value">{data.totalAccessCount}</p>
        </div>
        <div className="analytics__stat-card">
          <p className="analytics__stat-label">Created</p>
          <p className="analytics__stat-value">{formatDate(data.createdAt)}</p>
        </div>
        <div className="analytics__stat-card">
          <p className="analytics__stat-label">Expires</p>
          <p className="analytics__stat-value">{formatDate(data.expiresAt)}</p>
        </div>
      </div>

      <div className="analytics__chart-section">
        <p className="analytics__chart-title">Daily Clicks</p>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#667eea"
                strokeWidth={2}
                dot={{ fill: '#667eea', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="analytics__empty-chart">No access data yet</p>
        )}
      </div>
    </div>
  )
}
