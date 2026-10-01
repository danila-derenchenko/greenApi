import { useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, CircleAlert, CircleHelp, Info, LoaderCircle, Plus, Search, Send, X } from 'lucide-react'
import type { InstanceSettings, Message } from '../types'
import type { GreenApi } from '../lib/green-api'
import { useMessenger } from '../hooks/useMessenger'
import NewChat from './NewChat'
import MessageList from './MessageList'
import { timeFormat } from '../lib/format'
import { MAX_MESSAGE_LENGTH } from '../lib/message'

function initials(name: string) { return name.replace(/^[@+]/, '').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() }
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return <span className={`avatar ${small ? 'avatar-small' : ''}`} aria-hidden="true">{initials(name)}</span>
}

export default function ChatWorkspace({ api, settings, onLogout, onHelp }: { api: GreenApi | null; settings: InstanceSettings | null; onLogout: () => void; onHelp: () => void }) {
  const { state, dispatch, connection, createChat, send, demo } = useMessenger(api)
  const [search, setSearch] = useState('')
  const [newChat, setNewChat] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const composer = useRef<HTMLTextAreaElement>(null)
  const active = state.chats.find(chat => chat.id === state.activeId)
  const activeMessages = useMemo(() => state.messages.filter(message => message.chatId === state.activeId).sort((a, b) => a.timestamp - b.timestamp), [state.messages, state.activeId])
  const lastMessages = useMemo(() => {
    const map = new Map<string, Message>()
    for (const message of state.messages) if (!map.has(message.chatId) || map.get(message.chatId)!.timestamp <= message.timestamp) map.set(message.chatId, message)
    return map
  }, [state.messages])
  const filteredChats = [...state.chats].filter(chat => `${chat.name} ${chat.phone ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (lastMessages.get(b.id)?.timestamp ?? b.createdAt) - (lastMessages.get(a.id)?.timestamp ?? a.createdAt))
  const draft = active ? drafts[active.id] ?? '' : ''
  const sending = activeMessages.some(message => message.status === 'sending')
  const stopped = connection.status === 'stopped'
  const connectionText = demo ? 'Демоверсия' : connection.status === 'connected' ? 'Telegram подключён' : connection.status === 'connecting' ? 'Ожидаем сообщения' : connection.status === 'reconnecting' ? 'Восстанавливаем связь' : 'Соединение остановлено'

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!active || sending || stopped) return
    const chatId = active.id
    if (await send(chatId, draft)) {
      setDrafts(previous => ({ ...previous, [chatId]: '' }))
      composer.current?.focus()
    }
  }

  return <main className={`workspace ${active ? 'has-active-chat' : ''}`}>
    <aside className="chat-sidebar" aria-label="Список чатов">
      <div className="sidebar-heading"><h1>Сообщения</h1><button className="icon-button" onClick={onHelp} aria-label="Помощь" title="Помощь"><CircleHelp size={20} /></button></div>
      <div className="search-field"><Search size={17} /><input aria-label="Поиск чатов" placeholder="Поиск по чатам" value={search} onChange={e => setSearch(e.target.value)} />{search && <button className="clear-search" aria-label="Очистить поиск" onClick={() => setSearch('')}><X size={15} /></button>}</div>
      <button className="new-chat-button" onClick={() => setNewChat(true)} disabled={stopped}><Plus size={19} /> Новый чат</button>
      <div className="chat-list">
        {filteredChats.map(chat => {
          const lastMessage = lastMessages.get(chat.id)
          return <button key={chat.id} className={`chat-item ${active?.id === chat.id ? 'selected' : ''}`} onClick={() => dispatch({ type: 'select', id: chat.id })} aria-current={active?.id === chat.id ? 'true' : undefined}>
            <Avatar name={chat.name} /><span className="chat-item-content"><span className="chat-item-top"><strong>{chat.name}</strong><time>{lastMessage ? timeFormat.format(lastMessage.timestamp) : ''}</time></span><span className="chat-item-bottom"><span>{lastMessage?.direction === 'outgoing' && <span className="you-prefix">Вы: </span>}{lastMessage?.text ?? 'Начните разговор'}</span>{chat.unread > 0 && <span className="unread-count" aria-label={`${chat.unread} непрочитанных`}>{chat.unread}</span>}</span></span>
          </button>
        })}
        {filteredChats.length === 0 && <div className="empty-chat-list"><p>{search ? 'Ничего не найдено' : 'Пока нет чатов'}</p></div>}
      </div>
      <div className="sidebar-footer"><div className="connection-summary"><span className={`connection-indicator ${connection.status}`} /><span>{connectionText}</span></div><button className="text-link" onClick={onLogout} aria-label="Выйти из приложения" title="Выйти из приложения. Сессия GREEN-API в Telegram останется активной.">Выйти</button></div>
    </aside>

    <section className="chat-panel" aria-label="Переписка">
      <header className="chat-header">
        {active ? <><button className="icon-button back-button" aria-label="Назад к чатам" onClick={() => dispatch({ type: 'select', id: null })}><ArrowLeft size={22} /></button><Avatar name={active.name} small /><div className="contact-heading"><h2>{active.name}</h2><span>{active.phone ?? 'Telegram'}</span></div></> : <span className="panel-heading">Telegram · GREEN-API</span>}
        <button className="icon-button" onClick={onHelp} aria-label="Информация о подключении"><Info size={20} /></button>
      </header>
      {demo && <div className="demo-banner"><span>Демоверсия · сообщения не отправляются в Telegram</span><button className="text-link" onClick={onLogout}>Подключить аккаунт</button></div>}
      {!demo && settings?.incomingWebhook !== 'yes' && <div className="status-note" role="status"><Info size={14} /> Получение сообщений выключено. Отправлять сообщения можно.</div>}
      {connection.message && <div className="connection-banner" role="alert"><CircleAlert size={17} /><span>{connection.message}{connection.status === 'reconnecting' && ' Повторяем подключение автоматически.'}</span>{stopped && <button onClick={onLogout}>Переподключиться</button>}</div>}
      {!demo && settings?.outgoingWebhook !== 'yes' && <div className="status-note"><Info size={14} /> Статусы доставки отключены в настройках GREEN-API.<button onClick={onHelp}>Как включить</button></div>}
      {active ? <>
        <MessageList key={active.id} messages={activeMessages} retry={message => { void send(message.chatId, message.text, message.id) }} stopped={stopped} />
        <form className="composer" onSubmit={submit}>
          <div className="composer-input-wrap"><textarea ref={composer} aria-label="Текст сообщения" placeholder="Напишите сообщение…" rows={1} maxLength={MAX_MESSAGE_LENGTH} value={draft} disabled={stopped}
            onChange={event => setDrafts(previous => ({ ...previous, [active.id]: event.target.value }))}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit() } }} />
            <button className="send-button" aria-label="Отправить сообщение" title="Отправить сообщение" disabled={!draft.trim() || sending || stopped}>{sending ? <LoaderCircle size={21} className="spin" /> : <Send size={21} />}</button></div>
          <div className="composer-footer"><span>Enter — отправить <span className="hint-divider">·</span> Shift + Enter — новая строка</span><span className={draft.length >= 4000 ? 'length-warning' : ''}>{draft.length} / {MAX_MESSAGE_LENGTH}</span></div>
        </form>
      </> : <div className="welcome-chat"><p>Выберите чат слева или создайте новый.</p></div>}
    </section>
    {newChat && <NewChat onClose={() => setNewChat(false)} onCreate={createChat} demo={demo} />}
  </main>
}
