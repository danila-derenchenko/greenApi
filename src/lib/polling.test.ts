import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollNotifications } from './polling'
import { ApiError } from './green-api'

afterEach(() => vi.useRealTimers())

describe('notification queue', () => {
  it('handles an event before acknowledging it and consumes only one at a time', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const order: string[] = []
    const api = {
      receiveNotification: vi.fn(async () => { order.push('receive'); return { receiptId: 12, body: { typeWebhook: 'unsupported' } } }),
      deleteNotification: vi.fn(async () => { order.push('delete'); controller.abort() }),
    }
    await pollNotifications(api, controller.signal, () => { order.push('handle') }, vi.fn())
    expect(order).toEqual(['receive', 'handle', 'delete'])
    expect(api.deleteNotification).toHaveBeenCalledWith(12, controller.signal)
  })

  it('backs off and reprocesses an unacknowledged event when delete fails', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const handler = vi.fn()
    const connection = vi.fn()
    const api = {
      receiveNotification: vi.fn(async () => ({ receiptId: 12, body: {} })),
      deleteNotification: vi.fn().mockRejectedValueOnce(new ApiError('network')).mockImplementationOnce(async () => controller.abort()),
    }
    const task = pollNotifications(api, controller.signal, handler, connection)
    await vi.advanceTimersByTimeAsync(1999)
    expect(api.receiveNotification).toHaveBeenCalledTimes(1)
    expect(connection).toHaveBeenCalledWith(expect.objectContaining({ status: 'reconnecting' }))
    await vi.advanceTimersByTimeAsync(1)
    await task
    expect(handler).toHaveBeenCalledTimes(2)
    expect(api.deleteNotification).toHaveBeenCalledTimes(2)
  })

  it('stops on revoked credentials instead of polling forever', async () => {
    const connection = vi.fn()
    const api = { receiveNotification: vi.fn().mockRejectedValue(new ApiError('unauthorized', 401)), deleteNotification: vi.fn() }
    await pollNotifications(api, new AbortController().signal, vi.fn(), connection)
    expect(connection).toHaveBeenCalledWith({ status: 'stopped', message: 'unauthorized' })
    expect(api.deleteNotification).not.toHaveBeenCalled()
  })

  it('acknowledges a logout notification before stopping the receiver', async () => {
    const api = { receiveNotification: vi.fn().mockResolvedValue({ receiptId: 9, body: {} }), deleteNotification: vi.fn().mockResolvedValue(undefined) }
    const connection = vi.fn()
    await pollNotifications(api, new AbortController().signal, () => 'Telegram отключён', connection)
    expect(api.deleteNotification).toHaveBeenCalledOnce()
    expect(connection).toHaveBeenCalledWith({ status: 'stopped', message: 'Telegram отключён' })
  })

  it('aborts a waiting receiver without handling or deleting late notifications', async () => {
    const controller = new AbortController()
    const api = { receiveNotification: vi.fn(async () => { controller.abort(); return { receiptId: 1, body: {} } }), deleteNotification: vi.fn() }
    const handler = vi.fn()
    await pollNotifications(api, controller.signal, handler, vi.fn())
    expect(handler).not.toHaveBeenCalled()
    expect(api.deleteNotification).not.toHaveBeenCalled()
  })
})
