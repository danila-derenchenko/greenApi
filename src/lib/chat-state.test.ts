import { describe, expect, it } from 'vitest'
import { chatReducer, initialChatState } from './chat-state'
import { parseNotification } from './notifications'
import type { ChatEvent, Message } from '../types'

const message: Message = { id: 'server-1', chatId: '100001', text: 'Привет!', timestamp: 1_000, direction: 'incoming', status: 'delivered' }
const event: ChatEvent = { kind: 'message', name: 'Анна', message }

describe('Telegram notification handling', () => {
  it('updates a queued message when its outgoing echo arrives after confirmation', () => {
    const outgoing: Message = { ...message, direction: 'outgoing', status: 'queued' }
    const state = { ...initialChatState, messages: [outgoing] }
    const updated = chatReducer(state, { type: 'event', event: { ...event, message: { ...outgoing, status: 'sent' } } })
    expect(updated.messages).toEqual([{ ...outgoing, status: 'sent' }])
    expect(updated.chats).toEqual(state.chats)
    const read = chatReducer(updated, { type: 'event', event: { kind: 'status', chatId: message.chatId, id: message.id, status: 'read' } })
    expect(chatReducer(read, { type: 'event', event: { ...event, message: { ...outgoing, status: 'sent' } } })).toBe(read)
  })

  it('isolates a retry from late delivery errors for the previous attempt', () => {
    const state = { ...initialChatState, messages: [{ ...message, direction: 'outgoing' as const, status: 'failed' as const }] }
    const retried = chatReducer(state, { type: 'retry', chatId: message.chatId, id: message.id, localId: 'retry-local' })
    const late = chatReducer(retried, { type: 'event', event: { kind: 'status', chatId: message.chatId, id: message.id, status: 'failed' } })
    expect(late.messages[0]).toMatchObject({ id: 'retry-local', status: 'sending' })
    const confirmed = chatReducer(late, { type: 'confirm', chatId: message.chatId, localId: 'retry-local', serverId: 'retry-server' })
    expect(confirmed.messages).toHaveLength(1)
    expect(confirmed.messages[0]).toMatchObject({ id: 'retry-server', status: 'queued' })
  })

  it('routes an incoming reply to its canonical Telegram chatId and prevents duplicate unread counts', () => {
    const once = chatReducer(initialChatState, { type: 'event', event })
    const twice = chatReducer(once, { type: 'event', event })
    expect(twice.messages).toEqual([message])
    expect(twice.chats).toMatchObject([{ id: '100001', name: 'Анна', unread: 1 }])
    expect(chatReducer(twice, { type: 'select', id: '100001' }).chats[0].unread).toBe(0)
  })

  it('keeps messages with the same id in different chats', () => {
    const state = chatReducer(initialChatState, { type: 'event', event })
    const other = chatReducer(state, { type: 'event', event: { ...event, message: { ...message, chatId: '100002' } } })
    expect(other.messages).toHaveLength(2)
  })

  it('reconciles an API echo and a read status arriving before sendMessage resolves', () => {
    let state = chatReducer(initialChatState, { type: 'append', message: { ...message, id: 'local', direction: 'outgoing', status: 'sending' } })
    state = chatReducer(state, { type: 'event', event: { kind: 'status', chatId: message.chatId, id: 'server-1', status: 'read' } })
    state = chatReducer(state, { type: 'event', event: { ...event, message: { ...message, direction: 'outgoing', status: 'sent' } } })
    state = chatReducer(state, { type: 'confirm', chatId: message.chatId, localId: 'local', serverId: 'server-1' })
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({ id: 'server-1', status: 'read', direction: 'outgoing' })
    state = chatReducer(state, { type: 'event', event: { kind: 'status', chatId: message.chatId, id: 'server-1', status: 'delivered' } })
    expect(state.messages[0].status).toBe('read')
    expect(state.pendingStatuses).toEqual({})
  })

  it('does not apply one chat’s delivery receipt to another chat', () => {
    const state = chatReducer({ ...initialChatState, messages: [{ ...message, status: 'queued' }] }, {
      type: 'event', event: { kind: 'status', chatId: 'different-chat', id: 'server-1', status: 'read' },
    })
    expect(state.messages[0].status).toBe('queued')
  })

  it('extracts text and URL text while ignoring attachments and malformed notifications', () => {
    const body = { typeWebhook: 'incomingMessageReceived', idMessage: 'id', timestamp: 1700000000, senderData: { chatId: '123', chatName: 'Анна' } }
    expect(parseNotification({ ...body, messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: 'https://example.com' } } }))
      .toMatchObject({ kind: 'message', name: 'Анна', message: { chatId: '123', text: 'https://example.com', timestamp: 1700000000000 } })
    expect(parseNotification({ ...body, messageData: { typeMessage: 'imageMessage' } })).toBeNull()
    expect(parseNotification({ typeWebhook: 'incomingMessageReceived' })).toBeNull()
  })
})
