export interface Credentials {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

export interface InstanceSettings {
  typeInstance: string
  webhookUrl: string
  incomingWebhook: string
  outgoingWebhook?: string
  outgoingMessageWebhook?: string
  outgoingAPIMessageWebhook?: string
}

export interface Notification {
  receiptId: number
  body: Record<string, unknown>
}

export type DeliveryStatus = 'sending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'uncertain'

export interface Message {
  id: string
  chatId: string
  text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  status: DeliveryStatus
  error?: string
}

export interface Chat {
  id: string
  name: string
  phone?: string
  unread: number
  createdAt: number
}

export type ChatEvent =
  | { kind: 'message'; message: Message; name: string; phone?: string }
  | { kind: 'status'; chatId: string; id: string; status: DeliveryStatus }
  | { kind: 'state'; state: string }

export interface ChatState {
  chats: Chat[]
  messages: Message[]
  activeId: string | null
  pendingStatuses: Record<string, DeliveryStatus>
}
