import { useEffect, useRef } from 'react'
import { Check, CheckCheck, CircleAlert, Clock3, LoaderCircle } from 'lucide-react'
import type { DeliveryStatus, Message } from '../types'
import { timeFormat } from '../lib/format'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
function dayLabel(timestamp: number) {
  const today = new Date()
  const date = new Date(timestamp)
  return date.toDateString() === today.toDateString() ? 'Сегодня' : dateFormat.format(date)
}

const statusLabels: Record<DeliveryStatus, string> = { sending: 'Отправляется', queued: 'В очереди GREEN-API', sent: 'Отправлено', delivered: 'Доставлено', read: 'Прочитано', failed: 'Не отправлено', uncertain: 'Отправка не подтверждена' }
function Delivery({ status }: { status: DeliveryStatus }) {
  const Icon = status === 'sending' ? LoaderCircle : status === 'queued' ? Clock3 : ['read', 'delivered'].includes(status) ? CheckCheck : ['failed', 'uncertain'].includes(status) ? CircleAlert : Check
  return <span title={statusLabels[status]} aria-label={statusLabels[status]} className={`delivery delivery-${status}`}><Icon size={14} className={status === 'sending' ? 'spin' : ''} /></span>
}

export default function MessageList({ messages, retry, stopped }: { messages: Message[]; retry: (message: Message) => void; stopped: boolean }) {
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const last = messages.at(-1)
  useEffect(() => {
    if (atBottom.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [messages.length, last?.status])
  return <div ref={scroller} className="message-list" role="log" aria-label="Сообщения" aria-live="polite" aria-relevant="additions text"
    onScroll={() => { const el = scroller.current; if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100 }}>
    {messages.length === 0 && <div className="first-message"><p>Напишите первое сообщение.</p></div>}
    {messages.map((message, index) => <div className="message-group" key={message.id}>
      {(index === 0 || new Date(messages[index - 1].timestamp).toDateString() !== new Date(message.timestamp).toDateString()) && <div className="day-label"><span>{dayLabel(message.timestamp)}</span></div>}
      <div className={`message-row ${message.direction}`}>
        <div className={`message-bubble ${message.status === 'failed' || message.status === 'uncertain' ? 'message-error' : ''}`}>
          <div className="message-text">{message.text}</div>
          <div className="message-meta"><time dateTime={new Date(message.timestamp).toISOString()}>{timeFormat.format(message.timestamp)}</time>{message.direction === 'outgoing' && <Delivery status={message.status} />}</div>
          {(message.status === 'failed' || message.status === 'uncertain') && <div className="message-error-detail" role="status">
            <span>{message.error ?? 'Сообщение не доставлено. Проверьте получателя и статус инстанса.'}</span>
            {message.status === 'uncertain' ? <span>Перед повторной отправкой проверьте чат в Telegram: сообщение могло дойти.</span>
              : <button onClick={() => retry(message)} disabled={stopped}>Повторить отправку</button>}
          </div>}
        </div>
      </div>
    </div>)}
  </div>
}
