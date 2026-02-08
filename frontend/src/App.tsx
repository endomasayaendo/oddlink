import './App.css'
import { UrlForm } from './components/UrlForm'
import { ResultCard } from './components/ResultCard'
import { useShorten } from './hooks/useShorten'

function App() {
  const { shortUrl, error, loading, shorten, setError } = useShorten()

  return (
    <div className="container">
      <h1 className="title">OddLink</h1>
      <p className="subtitle">Where links get odd</p>

      <UrlForm onSubmit={shorten} loading={loading} />

      {error && <p className="error">{error}</p>}

      {shortUrl && <ResultCard shortUrl={shortUrl} onError={setError} />}
    </div>
  )
}

export default App
