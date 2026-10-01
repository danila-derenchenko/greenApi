import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { chatReducer, initialChatState } from '../lib/chat-state'
import { parseNotification } from '../lib/notifications'
import { isValidMessage } from '../lib/message'
import { createDemo } from '../lib/demo'
import { ApiError, errorMessage, GreenApi, parseRecipient } from '../lib/green-api'
import { delay, pollNotifications, type Connection } from '../lib/polling'
import type { Message } from '../types'

export function useMessenger(api: GreenApi | null) {
  const demo = !api
  const [state, dispatch] = useReducer(chatReducer, undefined, () => demo ? createDemo() : initialChatState)
  const [connection, setConnection] = useState<Connection>({ status: demo ? 'connected' : 'connecting' })
  const lifetime = useRef<AbortController | null>(null)
  const receiverTask = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(new Set<string>())

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    if (!api) return () => controller.abort()
    const run = async () => {
      if (controller.signal.aborted) return
      await pollNotifications(api, controller.signal, notification => {
        const event = parseNotification(notification.body)
        if (event?.kind === 'state' && event.state !== 'authorized') {
          return 'Telegram отключён. Авторизуйте инстанс в GREEN-API и подключитесь снова.'
        }
        if (event) dispatch({ type: 'event', event })
      }, setConnection)
    }
    const start = async () => {
      if (controller.signal.aborted) return
      if (navigator.locks) {
        await navigator.locks.request(`green-api:${api.credentials.idInstance}`, { ifAvailable: true }, async lock => {
          if (controller.signal.aborted) return
          if (!lock) { setConnection({ status: 'stopped', message: 'Этот инстанс уже открыт в другой вкладке. Закройте её и подключитесь снова.' }); return }
          await run()
        })
      } else await run()
    }
    receiverTask.current = receiverTask.current.then(start).catch(() => {
      if (!controller.signal.aborted) setConnection({ status: 'stopped', message: 'Не удалось начать получение сообщений. Подключитесь снова.' })
    })
    return () => controller.abort()
  }, [api])

  const createChat = useCallback(async (recipient: string, customName: string) => {
    const signal = lifetime.current!.signal
    const parsed = parseRecipient(recipient)
    const resolved = api ? await api.resolveRecipient(recipient, signal)
      : { chatId: `demo-${'phoneNumber' in parsed ? parsed.phoneNumber : parsed.username}`, name: recipient.trim(), phone: recipient.trim() }
    if (signal.aborted) return
    dispatch({ type: 'open', chat: { id: resolved.chatId, name: customName.trim() || resolved.name, phone: resolved.phone, unread: 0, createdAt: Date.now() } })
  }, [api])

  const send = useCallback(async (chatId: string, text: string, retryId?: string) => {
    if (!isValidMessage(text) || pending.current.has(chatId)) return false
    const signal = lifetime.current!.signal
    if (signal.aborted) return false
    pending.current.add(chatId)
    const localId = crypto.randomUUID()
    const message: Message = { id: localId, chatId, text, timestamp: Date.now(), direction: 'outgoing', status: 'sending' }
    if (retryId) dispatch({ type: 'retry', chatId, id: retryId, localId })
    else dispatch({ type: 'append', message })
    void (async () => {
      try {
        if (api) {
          const serverId = await api.sendMessage(chatId, text, signal)
          if (!signal.aborted) dispatch({ type: 'confirm', chatId, localId, serverId })
        } else {
          await delay(400, signal)
          dispatch({ type: 'confirm', chatId, localId, serverId: `demo-${localId}` })
          dispatch({ type: 'event', event: { kind: 'status', chatId, id: `demo-${localId}`, status: 'read' } })
          await delay(700, signal)
          dispatch({ type: 'event', event: { kind: 'message', name: 'Демо-контакт', message: {
            id: crypto.randomUUID(), chatId, text: 'Сообщение получено! Это автоматический ответ демоверсии. Для настоящей переписки подключите свой Telegram.', timestamp: Date.now(), direction: 'incoming', status: 'delivered',
          } } })
        }
      } catch (error) {
        if (!signal.aborted) dispatch({ type: 'fail', chatId, id: localId, error: errorMessage(error), uncertain: !(error instanceof ApiError) || error.status === 0 || error.status >= 500 })
      } finally { pending.current.delete(chatId) }
    })()
    return true
  }, [api])

  return { state, dispatch, connection, createChat, send, demo }
}
