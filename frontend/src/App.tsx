import './App.css'
import { UrlForm } from './components/UrlForm'
import { ResultCard } from './components/ResultCard'
import { HistoryList } from './components/HistoryList'
import { ErrorMessage } from './components/ErrorMessage'
import { useShorten } from './hooks/useShorten'
import { useHistory } from './hooks/useHistory'

function App() {
  const { result, error, loading, shorten, setError } = useShorten()
  const { history, addEntry, removeEntry } = useHistory()

  const handleShorten = async (originalUrl: string) => {
    const shortened = await shorten(originalUrl)
    if (shortened) {
      const shortCode = shortened.shortUrl.split('/').pop()!
      addEntry({
        shortCode,
        shortUrl: shortened.shortUrl,
        originalUrl: shortened.originalUrl,
      })
    }
  }

  return (
    <div className="container">
      <h1 className="title">OddLink</h1>
      <p className="subtitle">Where links get odd</p>

      <UrlForm onSubmit={handleShorten} loading={loading} />

      {error && <ErrorMessage message={error} onDismiss={() => setError('')} />}

      {result && (
        <div className="result-wrapper">
          <ResultCard shortUrl={result.shortUrl} onError={setError} />
        </div>
      )}

      <HistoryList history={history} onRemove={removeEntry} />
    </div>
  )
}

export default App
