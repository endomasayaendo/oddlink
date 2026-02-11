import { Link } from 'react-router-dom'
import './NotFound.css'

export function NotFound() {
  return (
    <div className="not-found">
      <p className="not-found__code">404</p>
      <p className="not-found__message">This link doesn't exist or has expired.</p>
      <Link to="/" className="not-found__link">
        Back to OddLink
      </Link>
    </div>
  )
}
