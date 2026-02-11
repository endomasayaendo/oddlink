import './ErrorMessage.css'

type Props = {
  message: string
  onDismiss: () => void
}

export function ErrorMessage({ message, onDismiss }: Props) {
  return (
    <div className="error-message">
      <span className="error-message__text">{message}</span>
      <button className="error-message__close" onClick={onDismiss} aria-label="Close">
        &times;
      </button>
    </div>
  )
}
