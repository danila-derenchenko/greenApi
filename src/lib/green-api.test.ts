import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, GreenApi, normalizeCredentials, parseRecipient } from './green-api'

const credentials = { apiUrl: 'https://4100.api.green-api.com/', idInstance: '4100123456', apiTokenInstance: 'test-token-00000000000000000000000' }
afterEach(() => vi.unstubAllGlobals())

describe('GREEN-API client', () => {
  it('resolves a username using the documented request format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ exist: true, chatId: '12345678', username: '@anna_demo' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new GreenApi(credentials).resolveRecipient(' @anna_demo ')).resolves.toMatchObject({ chatId: '12345678', name: '@anna_demo' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ username: '@anna_demo' })
  })

  it('receives and acknowledges notifications using their receipt id', async () => {
    const notification = { receiptId: 42, body: { typeWebhook: 'incomingMessageReceived' } }
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(notification)).mockResolvedValueOnce(Response.json({ result: true }))
    vi.stubGlobal('fetch', fetchMock)
    const api = new GreenApi(credentials)
    const signal = new AbortController().signal
    await expect(api.receiveNotification(signal)).resolves.toEqual(notification)
    await api.deleteNotification(notification.receiptId, signal)
    expect(fetchMock.mock.calls[0][0]).toContain('/receiveNotification/')
    expect(fetchMock.mock.calls[0][0]).toContain('?receiveTimeout=25')
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/42$/)
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
  })

  it('rejects malformed notification envelopes and failed acknowledgements', async () => {
    const api = new GreenApi(credentials)
    const signal = new AbortController().signal
    for (const value of [{ receiptId: 1, body: [] }, { receiptId: '1', body: {} }, { receiptId: 1, body: null }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)))
      await expect(api.receiveNotification(signal)).rejects.toThrow('некорректное уведомление')
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ result: false })))
    await expect(api.deleteNotification(1, signal)).rejects.toThrow('Не удалось подтвердить уведомление')
  })

  it('preserves cancellation without presenting it as a network failure', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(controller.signal.reason))
    await expect(new GreenApi(credentials).receiveNotification(controller.signal)).rejects.toBe(controller.signal.reason)
  })

  it('accepts instance IDs of different lengths and preserves every digit', () => {
    for (const idInstance of ['4100123456', '410012345678', '18446744073709551615']) {
      expect(normalizeCredentials({ ...credentials, idInstance: ` ${idInstance}\n` }).idInstance).toBe(idInstance)
    }
  })

  it('rejects empty or non-digit instance IDs before making a request', () => {
    for (const idInstance of ['', '   ', '4100abc123', '-410012345678', '4.1e11', '4100/1234', '4100 1234']) {
      expect(() => new GreenApi({ ...credentials, idInstance })).toThrow('idInstance должен содержать только цифры')
    }
  })

  it('normalizes the host and rejects destinations that could leak the token', () => {
    expect(normalizeCredentials(credentials).apiUrl).toBe('https://4100.api.green-api.com')
    for (const apiUrl of ['https://green-api.com.example.com', 'http://4100.api.green-api.com', 'https://user:pass@4100.api.green-api.com', 'https://4100.api.green-api.com/path', 'https://4100.api.green-api.com/?secret=1']) {
      expect(() => normalizeCredentials({ ...credentials, apiUrl })).toThrow(ApiError)
    }
  })

  it('accepts formatted international phone numbers without treating them as Telegram chat ids', () => {
    expect(parseRecipient('+7 (999) 123-45-67')).toEqual({ phoneNumber: 79991234567 })
    expect(parseRecipient('@anna_demo')).toEqual({ username: '@anna_demo' })
    expect(() => parseRecipient('12')).toThrow()
    expect(() => parseRecipient('7999abc1234567')).toThrow()
  })

  it('resolves the phone with checkAccount and sends text to the returned canonical id', async () => {
    const mock = vi.fn().mockResolvedValueOnce(Response.json({ exist: true, chatId: '12345678', username: '@anna_demo' })).mockResolvedValueOnce(Response.json({ idMessage: 'out-1' }))
    vi.stubGlobal('fetch', mock)
    const api = new GreenApi(credentials)
    const contact = await api.resolveRecipient('+7 999 123 45 67')
    expect(contact.chatId).toBe('12345678')
    await api.sendMessage(contact.chatId, 'Привет!')
    expect(mock.mock.calls[0][0]).toContain('/checkAccount/')
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({ phoneNumber: 79991234567 })
    expect(mock.mock.calls[1][0]).toContain('/sendMessage/')
    expect(JSON.parse(mock.mock.calls[1][1].body)).toEqual({ chatId: '12345678', message: 'Привет!' })
  })

  it('blocks the wrong messenger and a conflicting webhook endpoint', async () => {
    for (const settings of [{ typeInstance: 'whatsapp' }, { typeInstance: 'telegram', webhookUrl: 'https://example.com/hook' }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ stateInstance: 'authorized' })).mockResolvedValueOnce(Response.json(settings)))
      await expect(new GreenApi(credentials).connect()).rejects.toBeInstanceOf(ApiError)
    }
  })

  it('allows login when incoming notifications are disabled without changing settings', async () => {
    const settings = { typeInstance: 'telegram', webhookUrl: '', incomingWebhook: 'no' }
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ stateInstance: 'authorized' })).mockResolvedValueOnce(Response.json(settings))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new GreenApi(credentials).connect()).resolves.toEqual(settings)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true)
  })

  it('reports HTTP failures without echoing a token from the server response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(credentials.apiTokenInstance, { status: 401 })))
    await expect(new GreenApi(credentials).connect()).rejects.toMatchObject({ status: 401, message: 'Неверные данные доступа. Проверьте idInstance и apiTokenInstance.' })
  })

  it('rejects empty or too long messages before a network request', async () => {
    const mock = vi.fn()
    vi.stubGlobal('fetch', mock)
    const api = new GreenApi(credentials)
    await expect(api.sendMessage('123', '   ')).rejects.toThrow()
    await expect(api.sendMessage('123', 'a'.repeat(4097))).rejects.toThrow()
    expect(mock).not.toHaveBeenCalled()
  })

  it('handles a 200 response containing a Telegram rate limit as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: false, data: { status: 'fail', reason: 'rate_limit_exceeded' } })))
    await expect(new GreenApi(credentials).resolveRecipient('@anna_demo')).rejects.toMatchObject({ status: 429 })
  })
})
