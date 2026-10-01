import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import Modal from './Modal'
import { errorMessage } from '../lib/green-api'

export default function NewChat({ onClose, onCreate, demo }: { onClose: () => void; onCreate: (recipient: string, name: string) => Promise<void>; demo: boolean }) {
  const [recipient, setRecipient] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try { await onCreate(recipient, name); onClose() }
    catch (err) { setError(errorMessage(err)); setBusy(false) }
  }
  return <Modal title="Новый чат" onClose={busy ? () => {} : onClose}>
    <form className="new-chat-form" onSubmit={submit}>
      <label htmlFor="recipient">Номер телефона или @username</label>
      <input id="recipient" autoFocus autoComplete="off" placeholder="+7 999 123-45-67" value={recipient} onChange={event => setRecipient(event.target.value)} disabled={busy} required />
      <p className="field-hint">Укажите код страны. Если номер скрыт в Telegram, используйте @username.</p>
      <label htmlFor="contact-name">Имя контакта <span>необязательно</span></label>
      <input id="contact-name" placeholder="Как зовут собеседника?" maxLength={70} value={name} onChange={event => setName(event.target.value)} disabled={busy} />
      {error && <div className="error-box" role="alert">{error}</div>}
      {demo && <p className="field-hint">Демоверсия: контакт будет создан только в этом окне.</p>}
      <button className="primary-button full-width" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Ищем в Telegram…</> : 'Начать разговор'}</button>
    </form>
  </Modal>
}
