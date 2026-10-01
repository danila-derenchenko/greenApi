import type { ChatState } from '../types'

export function createDemo(): ChatState {
  const now = Date.now()
  return {
    activeId: 'demo-anna', pendingStatuses: {},
    chats: [
      { id: 'demo-anna', name: 'Анна', phone: '@anna_demo', unread: 0, createdAt: now - 600_000 },
      { id: 'demo-team', name: 'Команда проекта', unread: 1, createdAt: now - 1_000_000 },
    ],
    messages: [
      { id: 'd1', chatId: 'demo-anna', text: 'Привет! Как продвигается наш новый чат?', direction: 'incoming', timestamp: now - 600_000, status: 'read' },
      { id: 'd2', chatId: 'demo-anna', text: 'Привет! Уже можно общаться прямо из браузера ✨', direction: 'outgoing', timestamp: now - 540_000, status: 'read' },
      { id: 'd3', chatId: 'demo-anna', text: 'Всё просто: подключаешь Telegram, создаёшь чат и пишешь сообщение.', direction: 'outgoing', timestamp: now - 520_000, status: 'read' },
      { id: 'd4', chatId: 'demo-anna', text: 'Здорово! Давай попробуем 💚', direction: 'incoming', timestamp: now - 480_000, status: 'delivered' },
      { id: 'd5', chatId: 'demo-team', text: 'Здесь появятся ваши новые сообщения.', direction: 'incoming', timestamp: now - 1_000_000, status: 'delivered' },
    ],
  }
}
