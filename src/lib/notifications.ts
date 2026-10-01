import type { ChatEvent, DeliveryStatus } from '../types'
import { record } from './record'

export function parseNotification(body: Record<string, unknown>): ChatEvent | null {
  if (body.typeWebhook === 'stateInstanceChanged' && typeof body.stateInstance === 'string') return { kind: 'state', state: body.stateInstance }
  if (body.typeWebhook === 'outgoingMessageStatus') {
    const statuses: Record<string, DeliveryStatus> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed', noAccount: 'failed', notInGroup: 'failed' }
    if (typeof body.chatId !== 'string' || typeof body.idMessage !== 'string' || typeof body.status !== 'string' || !statuses[body.status]) return null
    return { kind: 'status', chatId: body.chatId, id: body.idMessage, status: statuses[body.status] }
  }
  const incoming = body.typeWebhook === 'incomingMessageReceived'
  if (!incoming && body.typeWebhook !== 'outgoingMessageReceived' && body.typeWebhook !== 'outgoingAPIMessageReceived') return null
  const sender = record(body.senderData)
  const data = record(body.messageData)
  const text = data.typeMessage === 'textMessage' ? record(data.textMessageData).textMessage
    : data.typeMessage === 'extendedTextMessage' ? record(data.extendedTextMessageData).text : null
  if (typeof text !== 'string' || typeof sender.chatId !== 'string' || typeof body.idMessage !== 'string') return null
  const name = [sender.chatName, sender.senderContactName, sender.senderName, sender.chatId].find(value => typeof value === 'string' && value) as string
  return {
    kind: 'message', name,
    phone: sender.senderPhoneNumber ? `+${sender.senderPhoneNumber}` : undefined,
    message: {
      id: body.idMessage, chatId: sender.chatId, text,
      timestamp: typeof body.timestamp === 'number' ? body.timestamp * 1000 : Date.now(),
      direction: incoming ? 'incoming' : 'outgoing', status: incoming ? 'delivered' : 'sent',
    },
  }
}
