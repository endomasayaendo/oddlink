import './App.css'
import { UrlForm } from './components/UrlForm'
import { ResultCard } from './components/ResultCard'
import { ErrorMessage } from './components/ErrorMessage'
import { useShorten } from './hooks/useShorten'

function App() {
  const { shortUrl, error, loading, shorten, setError } = useShorten()

  return (
    <div className="container">
      <h1 className="title">OddLink</h1>
      <p className="subtitle">Where links get odd</p>

      <UrlForm onSubmit={shorten} loading={loading} />

      {error && <ErrorMessage message={error} onDismiss={() => setError('')} />}

      {shortUrl && <ResultCard shortUrl={shortUrl} onError={setError} />}
    </div>
  )
}

export default App
