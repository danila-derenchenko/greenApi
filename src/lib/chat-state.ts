import type { Chat, ChatEvent, ChatState, DeliveryStatus, Message } from '../types'

export const initialChatState: ChatState = { chats: [], messages: [], activeId: null, pendingStatuses: {} }

export type ChatAction =
  | { type: 'open'; chat: Chat }
  | { type: 'select'; id: string | null }
  | { type: 'event'; event: ChatEvent }
  | { type: 'append'; message: Message }
  | { type: 'retry'; chatId: string; id: string; localId: string }
  | { type: 'confirm'; chatId: string; localId: string; serverId: string }
  | { type: 'fail'; chatId: string; id: string; error: string; uncertain: boolean }

function statusKey(chatId: string, id: string) { return `${chatId}:${id}` }

function mergeStatus(previous: DeliveryStatus, next: DeliveryStatus): DeliveryStatus {
  const rank: Record<DeliveryStatus, number> = { sending: 0, uncertain: 0, queued: 1, sent: 2, failed: 2, delivered: 3, read: 4 }
  return rank[next] >= rank[previous] ? next : previous
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'open': return {
      ...state, activeId: action.chat.id,
      chats: state.chats.some(chat => chat.id === action.chat.id)
        ? state.chats.map(chat => chat.id === action.chat.id ? { ...chat, unread: 0 } : chat)
        : [...state.chats, action.chat],
    }
    case 'select': return { ...state, activeId: action.id, chats: state.chats.map(chat => chat.id === action.id ? { ...chat, unread: 0 } : chat) }
    case 'append': return { ...state, messages: [...state.messages, action.message] }
    case 'retry': return { ...state, messages: state.messages.map(message => message.chatId === action.chatId && message.id === action.id
      ? { ...message, id: action.localId, status: 'sending', error: undefined } : message) }
    case 'confirm': {
      const echo = state.messages.find(message => message.chatId === action.chatId && message.id === action.serverId)
      const key = statusKey(action.chatId, action.serverId)
      const pendingStatuses = { ...state.pendingStatuses }
      delete pendingStatuses[key]
      return {
        ...state, pendingStatuses,
        messages: state.messages.filter(message => !(message.chatId === action.chatId && message.id === action.serverId))
          .map(message => message.chatId === action.chatId && message.id === action.localId
            ? { ...message, id: action.serverId, status: mergeStatus(echo?.status ?? 'queued', state.pendingStatuses[key] ?? 'queued') } : message),
      }
    }
    case 'fail': return { ...state, messages: state.messages.map(message => message.chatId === action.chatId && message.id === action.id
      ? { ...message, status: action.uncertain ? 'uncertain' : 'failed', error: action.error } : message) }
    case 'event': {
      const event = action.event
      if (event.kind === 'state') return state
      if (event.kind === 'status') {
        const key = statusKey(event.chatId, event.id)
        const exists = state.messages.some(message => message.chatId === event.chatId && message.id === event.id)
        return {
          ...state,
          pendingStatuses: exists ? state.pendingStatuses : { ...state.pendingStatuses, [key]: mergeStatus(state.pendingStatuses[key] ?? 'queued', event.status) },
          messages: state.messages.map(message => message.chatId === event.chatId && message.id === event.id ? { ...message, status: mergeStatus(message.status, event.status) } : message),
        }
      }
      const { message, name, phone } = event
      const duplicate = state.messages.find(item => item.chatId === message.chatId && item.id === message.id)
      if (duplicate) {
        const status = mergeStatus(duplicate.status, message.status)
        if (status === duplicate.status) return state
        return {
          ...state,
          messages: state.messages.map(item => item === duplicate ? { ...item, status } : item),
        }
      }
      const existing = state.chats.find(chat => chat.id === message.chatId)
      const unread = message.direction === 'incoming' && state.activeId !== message.chatId ? 1 : 0
      const key = statusKey(message.chatId, message.id)
      const pendingStatuses = { ...state.pendingStatuses }
      delete pendingStatuses[key]
      return {
        ...state, pendingStatuses,
        chats: existing ? state.chats.map(chat => chat.id === message.chatId ? { ...chat, unread: chat.unread + unread } : chat)
          : [...state.chats, { id: message.chatId, name, phone, unread, createdAt: message.timestamp }],
        messages: [...state.messages, { ...message, status: mergeStatus(message.status, state.pendingStatuses[key] ?? message.status) }],
      }
    }
  }
}
