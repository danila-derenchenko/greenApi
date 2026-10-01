import { record } from './record'
import { isValidMessage, MAX_MESSAGE_LENGTH } from './message'
import type { Credentials, InstanceSettings, Notification } from '../types'

export class ApiError extends Error {
  constructor(message: string, public status = 0) {
    super(message)
    this.name = 'ApiError'
  }
}

export function normalizeCredentials(input: Credentials): Credentials {
  let url: URL
  try { url = new URL(input.apiUrl.trim()) } catch { throw new ApiError('Укажите корректный apiUrl из личного кабинета.') }
  if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*green-api\.com$/.test(url.hostname)
    || url.username || url.password || url.port || url.search || url.hash || !/^\/?$/.test(url.pathname)) {
    throw new ApiError('apiUrl должен быть HTTPS-адресом GREEN-API, например https://4100.api.green-api.com.')
  }
  const idInstance = input.idInstance.trim()
  const apiTokenInstance = input.apiTokenInstance.trim()
  if (!/^\d+$/.test(idInstance)) throw new ApiError('idInstance должен содержать только цифры. Скопируйте ID из личного кабинета GREEN-API.')
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(apiTokenInstance)) throw new ApiError('Проверьте apiTokenInstance: скопируйте ключ целиком из личного кабинета.')
  return { apiUrl: url.origin, idInstance, apiTokenInstance }
}

export function parseRecipient(input: string): { phoneNumber: number } | { username: string } {
  const value = input.trim()
  if (value.startsWith('@')) {
    if (!/^@[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(value)) throw new ApiError('Проверьте @username получателя.')
    return { username: value }
  }
  if (!/^\+?[\d\s()-]+$/.test(value)) throw new ApiError('Введите номер с кодом страны или @username.')
  const digits = value.replace(/\D/g, '')
  if (!/^[1-9]\d{6,14}$/.test(digits)) throw new ApiError('Введите номер в международном формате, например +7 999 123-45-67.')
  return { phoneNumber: Number(digits) }
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Не удалось выполнить запрос. Проверьте соединение и попробуйте ещё раз.'
}

function httpError(status: number): ApiError {
  const messages: Record<number, string> = {
    400: 'GREEN-API отклонил запрос. Проверьте данные и настройки уведомлений в личном кабинете.',
    401: 'Неверные данные доступа. Проверьте idInstance и apiTokenInstance.',
    403: 'Доступ запрещён. Проверьте токен, статус и тариф инстанса.',
    404: 'Инстанс не найден. Проверьте apiUrl и idInstance.',
    429: 'Слишком много запросов. Подождите немного и повторите попытку.',
    466: 'Превышен лимит тарифа GREEN-API. Проверьте ограничения в личном кабинете.',
    469: 'Telegram временно ограничил запросы. Повторите попытку позже.',
  }
  return new ApiError(messages[status] ?? `GREEN-API временно недоступен (HTTP ${status}). Попробуйте позже.`, status)
}

export class GreenApi {
  readonly credentials: Credentials

  constructor(credentials: Credentials) { this.credentials = normalizeCredentials(credentials) }

  private async request(method: string, options: { verb?: string; body?: unknown; suffix?: string; signal?: AbortSignal; timeout?: number } = {}): Promise<unknown> {
    const { apiUrl, idInstance, apiTokenInstance } = this.credentials
    const timeout = AbortSignal.timeout(options.timeout ?? 20_000)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    try {
      const response = await fetch(`${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}${options.suffix ?? ''}`, {
        method: options.verb ?? 'GET',
        ...(options.body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }),
        signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      })
      if (!response.ok) throw httpError(response.status)
      const data: unknown = await response.json()
      const body = record(data)
      if (body.status === false) {
        if (record(body.data).status === 'fail') throw new ApiError('Telegram ограничил поиск контактов. Попробуйте позже.', 429)
        throw new ApiError('GREEN-API не выполнил операцию. Проверьте авторизацию инстанса и повторите попытку.', 400)
      }
      return data
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason
      if (error instanceof ApiError) throw error
      if (timeout.aborted) throw new ApiError('Время ожидания истекло. Проверьте соединение с GREEN-API.')
      throw new ApiError('Нет соединения с GREEN-API. Проверьте интернет, apiUrl и доступность сервиса.')
    }
  }

  async connect(signal?: AbortSignal): Promise<InstanceSettings> {
    const state = record(await this.request('getStateInstance', { signal }))
    if (state.stateInstance !== 'authorized') {
      throw new ApiError('Инстанс не авторизован. Подключите Telegram в личном кабинете GREEN-API и дождитесь статуса authorized.')
    }
    const data = record(await this.request('getSettings', { signal }))
    if (data.typeInstance !== 'telegram') throw new ApiError('Нужен инстанс Telegram. Выберите его в личном кабинете GREEN-API.')
    if (data.webhookUrl) throw new ApiError('Для получения ответов очистите webhookUrl в настройках инстанса. Сохраните изменения, подождите минуту и подключитесь снова.')
    return data as unknown as InstanceSettings
  }

  async resolveRecipient(input: string, signal?: AbortSignal): Promise<{ chatId: string; name: string; phone?: string }> {
    const recipient = parseRecipient(input)
    const data = record(await this.request('checkAccount', { verb: 'POST', body: recipient, signal }))
    if (data.exist !== true || typeof data.chatId !== 'string' || !/^-?\d+$/.test(data.chatId)) {
      throw new ApiError('Аккаунт не найден или номер скрыт настройками приватности Telegram. Попробуйте @username получателя.')
    }
    const phone = 'phoneNumber' in recipient ? `+${recipient.phoneNumber}` : undefined
    return { chatId: data.chatId, name: typeof data.username === 'string' && data.username ? data.username : phone ?? input.trim(), phone }
  }

  async sendMessage(chatId: string, message: string, signal?: AbortSignal): Promise<string> {
    if (!isValidMessage(message)) throw new ApiError(`Сообщение должно содержать от 1 до ${MAX_MESSAGE_LENGTH} символов.`)
    const data = record(await this.request('sendMessage', { verb: 'POST', body: { chatId, message }, signal }))
    if (typeof data.idMessage !== 'string' || !data.idMessage) throw new ApiError('Сервер не подтвердил отправку. Проверьте чат в Telegram перед повтором.')
    return data.idMessage
  }

  async receiveNotification(signal: AbortSignal): Promise<Notification | null> {
    const data = await this.request('receiveNotification', { suffix: '?receiveTimeout=25', signal, timeout: 35_000 })
    if (data === null) return null
    const envelope = record(data)
    if (!Number.isSafeInteger(envelope.receiptId) || !envelope.body || typeof envelope.body !== 'object' || Array.isArray(envelope.body)) {
      throw new ApiError('GREEN-API вернул некорректное уведомление. Получение будет повторено.')
    }
    return { receiptId: envelope.receiptId as number, body: record(envelope.body) }
  }

  async deleteNotification(receiptId: number, signal: AbortSignal): Promise<void> {
    const data = record(await this.request('deleteNotification', { verb: 'DELETE', suffix: `/${receiptId}`, signal }))
    if (data.result !== true) throw new ApiError('Не удалось подтвердить уведомление. Получение будет повторено.')
  }
}
