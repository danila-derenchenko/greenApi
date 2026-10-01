import type { Notification } from '../types'
import { ApiError, errorMessage } from './green-api'

export type Connection = { status: 'connecting' | 'connected' | 'reconnecting' | 'stopped'; message?: string }

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

interface NotificationApi {
  receiveNotification: (signal: AbortSignal) => Promise<Notification | null>
  deleteNotification: (receiptId: number, signal: AbortSignal) => Promise<void>
}

export async function pollNotifications(api: NotificationApi, signal: AbortSignal,
  onNotification: (notification: Notification) => void | string,
  onConnection: (connection: Connection) => void): Promise<void> {
  let failures = 0
  while (!signal.aborted) {
    try {
      const notification = await api.receiveNotification(signal)
      if (signal.aborted) return
      if (notification) {
        const stopReason = onNotification(notification)
        await api.deleteNotification(notification.receiptId, signal)
        if (stopReason) { onConnection({ status: 'stopped', message: stopReason }); return }
      }
      failures = 0
      onConnection({ status: 'connected' })
      await delay(1_050, signal)
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof ApiError && [400, 401, 403, 404, 466].includes(error.status)) {
        onConnection({ status: 'stopped', message: error.message })
        return
      }
      failures += 1
      onConnection({ status: 'reconnecting', message: errorMessage(error) })
      try { await delay(Math.min(1000 * 2 ** failures, 30_000), signal) } catch { return }
    }
  }
}
