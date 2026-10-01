import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { errorMessage, GreenApi } from '../lib/green-api'
import type { InstanceSettings } from '../types'

interface Props {
  onConnect: (api: GreenApi, settings: InstanceSettings) => void
  onDemo: () => void
  onHelp: () => void
}

export default function Login({ onConnect, onDemo, onHelp }: Props) {
  const [apiUrl, setApiUrl] = useState('')
  const [idInstance, setIdInstance] = useState('')
  const [token, setToken] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  async function connect(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    request.current = new AbortController()
    try {
      const api = new GreenApi({ apiUrl, idInstance, apiTokenInstance: token })
      const settings = await api.connect(request.current.signal)
      if (!request.current.signal.aborted) onConnect(api, settings)
    } catch (err) {
      if (!request.current.signal.aborted) setError(errorMessage(err))
    } finally { if (!request.current.signal.aborted) setBusy(false) }
  }

  return <main className="login-page">
      <section className="connect-card" aria-labelledby="connect-title">
        <p className="app-name">Telegram · GREEN-API</p>
        <h1 id="connect-title">Подключите аккаунт</h1>
        <p className="card-description">Введите данные инстанса из личного кабинета GREEN-API.</p>
        <form onSubmit={connect} className="connect-form">
          <label htmlFor="api-url">API URL<span>Адрес сервера</span></label>
          <input id="api-url" type="url" autoComplete="url" placeholder="https://4100.api.green-api.com" value={apiUrl} onChange={e => setApiUrl(e.target.value)} required disabled={busy} spellCheck={false} />
          <label htmlFor="instance">ID инстанса<span>idInstance</span></label>
          <input id="instance" inputMode="numeric" autoComplete="off" placeholder="ID из личного кабинета" value={idInstance} onChange={e => setIdInstance(e.target.value)} required disabled={busy} spellCheck={false} />
          <label htmlFor="token">API-токен<span>apiTokenInstance</span></label>
          <div className="password-field"><input id="token" type={visible ? 'text' : 'password'} autoComplete="off" placeholder="Ваш секретный ключ" value={token} onChange={e => setToken(e.target.value)} required disabled={busy} spellCheck={false} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Скрыть токен' : 'Показать токен'} aria-pressed={visible}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {error && <div className="error-box" role="alert">{error}</div>}
          <button className="primary-button full-width" disabled={busy}>{busy ? <><LoaderCircle size={18} className="spin" /> Подключаемся…</> : 'Открыть чат'}</button>
        </form>
        <p className="privacy-note">Токен хранится только в памяти этой вкладки.</p>
        <button className="secondary-button full-width" onClick={onDemo} disabled={busy}>Открыть демоверсию</button>
        <div className="login-links"><button className="text-link" onClick={onHelp}>Как подключиться</button><a className="text-link" href="https://console.green-api.com/" target="_blank" rel="noreferrer">Личный кабинет</a></div>
      </section>
  </main>
}
