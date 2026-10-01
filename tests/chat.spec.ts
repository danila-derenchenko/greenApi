import { test, expect, type Page } from '@playwright/test'

const fakeToken = 'test-token-00000000000000000000000'
const incoming = (receiptId: number, id = 'incoming-1', text = 'Ответ из Telegram') => ({ receiptId, body: {
  typeWebhook: 'incomingMessageReceived', idMessage: id, timestamp: Math.floor(Date.now() / 1000),
  senderData: { chatId: '12345678', chatName: 'Анна' }, messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
} })

async function mockApi(page: Page, options: { state?: string; webhookUrl?: string; incomingWebhook?: string; failSend?: boolean; retryPoll?: boolean; absent?: boolean } = {}) {
  const queue: unknown[] = []
  const calls: { method: string; body: unknown; verb: string; url: string }[] = []
  let sends = 0
  let receives = 0
  await page.route('https://4100.api.green-api.com/**', async route => {
    const request = route.request()
    const method = new URL(request.url()).pathname.split('/')[2]
    calls.push({ method, body: request.postDataJSON(), verb: request.method(), url: request.url() })
    let data: unknown
    switch (method) {
      case 'getStateInstance': data = { stateInstance: options.state ?? 'authorized' }; break
      case 'getSettings': data = { typeInstance: 'telegram', webhookUrl: options.webhookUrl ?? '', incomingWebhook: options.incomingWebhook ?? 'yes', outgoingWebhook: 'yes' }; break
      case 'checkAccount': data = options.absent ? { exist: false } : { exist: true, chatId: '12345678', username: '@anna_demo' }; break
      case 'sendMessage':
        sends++
        if (options.failSend && sends === 1) { await route.fulfill({ status: 429, json: {} }); return }
        data = { idMessage: 'sent-1' }; break
      case 'receiveNotification':
        receives++
        if (options.retryPoll && receives === 1) { await route.fulfill({ status: 503, json: {} }); return }
        data = queue[0] ?? null; break
      case 'deleteNotification': queue.shift(); data = { result: true }; break
      default: throw new Error(`Unexpected API method: ${method}`)
    }
    await route.fulfill({ json: data })
  })
  return { queue, calls }
}

async function connect(page: Page) {
  await page.goto('/')
  await page.getByLabel('API URL').fill('https://4100.api.green-api.com')
  await page.getByLabel('ID инстанса').fill('410012345678')
  await page.getByLabel('API-токен', { exact: false }).fill(fakeToken)
  await page.getByRole('button', { name: 'Открыть чат', exact: true }).click()
}

async function newChat(page: Page) {
  await page.getByRole('button', { name: 'Новый чат', exact: true }).click()
  await page.getByLabel('Номер телефона или @username').fill('+7 (999) 123-45-67')
  await page.getByLabel('Имя контакта').fill('Анна')
  await page.getByRole('button', { name: 'Начать разговор' }).click()
}

test('mocked integration contract: connect, resolve phone, send, receive, deduplicate and acknowledge', async ({ page }) => {
  const { queue, calls } = await mockApi(page)
  await connect(page)
  await newChat(page)
  await expect(page.getByRole('heading', { name: 'Анна', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Текст сообщения' }).fill('Привет, Анна!')
  await page.getByRole('button', { name: 'Отправить сообщение' }).click()
  await expect(page.getByRole('log')).toContainText('Привет, Анна!')
  queue.push(incoming(1), incoming(2), { receiptId: 3, body: { typeWebhook: 'outgoingMessageStatus', chatId: '12345678', idMessage: 'sent-1', status: 'read' } })
  await expect(page.getByRole('log').getByText('Ответ из Telegram', { exact: true })).toHaveCount(1)
  await expect(page.getByLabel('Прочитано', { exact: true })).toBeVisible()
  expect(calls.find(call => call.method === 'checkAccount')?.body).toEqual({ phoneNumber: 79991234567 })
  expect(calls.find(call => call.method === 'getStateInstance')?.url).toContain('/waInstance410012345678/getStateInstance/')
  expect(calls.find(call => call.method === 'sendMessage')?.body).toEqual({ chatId: '12345678', message: 'Привет, Анна!' })
  expect(calls.filter(call => call.method === 'deleteNotification')).toHaveLength(3)
  expect(calls.filter(call => call.method === 'deleteNotification').every(call => call.verb === 'DELETE')).toBe(true)
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(fakeToken)
  await page.getByRole('button', { name: 'Выйти из приложения', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Подключите аккаунт' })).toBeVisible()
  await expect(page.getByLabel('API-токен', { exact: false })).toHaveValue('')
  const count = calls.length
  await page.waitForTimeout(1200)
  expect(calls).toHaveLength(count)
})

test('outgoing API notification updates a queued message without delivery webhooks', async ({ page }) => {
  const { queue } = await mockApi(page)
  await connect(page)
  await newChat(page)
  await page.getByRole('textbox', { name: 'Текст сообщения' }).fill('Проверка исходящего уведомления')
  await page.getByRole('button', { name: 'Отправить сообщение' }).click()
  await expect(page.getByLabel('В очереди GREEN-API', { exact: true })).toBeVisible()
  const notification = incoming(10, 'sent-1', 'Проверка исходящего уведомления')
  notification.body.typeWebhook = 'outgoingAPIMessageReceived'
  queue.push(notification)
  await expect(page.getByLabel('Отправлено', { exact: true })).toBeVisible()
  await expect(page.getByRole('log').getByText('Проверка исходящего уведомления', { exact: true })).toHaveCount(1)
})

test('explains how to authorize an unlinked Telegram instance', async ({ page }) => {
  await mockApi(page, { state: 'notAuthorized' })
  await connect(page)
  await expect(page.getByRole('alert')).toContainText('Инстанс не авторизован')
})

test('requires HTTP polling settings before opening the chat', async ({ page }) => {
  await mockApi(page, { webhookUrl: 'https://example.com/hook' })
  await connect(page)
  await expect(page.getByRole('alert')).toContainText('очистите webhookUrl')
})

test('allows login, chat creation and sending with incoming notifications disabled', async ({ page }) => {
  const { calls } = await mockApi(page, { incomingWebhook: 'no' })
  await connect(page)
  await expect(page.getByRole('status')).toContainText('Получение сообщений выключено')
  await newChat(page)
  await page.getByRole('textbox', { name: 'Текст сообщения' }).fill('Сообщение без входящих уведомлений')
  await page.getByRole('button', { name: 'Отправить сообщение' }).click()
  await expect(page.getByLabel('В очереди GREEN-API', { exact: true })).toBeVisible()
  expect(calls.find(call => call.method === 'sendMessage')?.body).toEqual({ chatId: '12345678', message: 'Сообщение без входящих уведомлений' })
  expect(calls.some(call => call.method === 'setSettings')).toBe(false)
})

test('retains a rejected message and retries only after a user click', async ({ page }) => {
  const { calls } = await mockApi(page, { failSend: true })
  await connect(page)
  await newChat(page)
  await page.getByRole('textbox', { name: 'Текст сообщения' }).fill('Повторяем вручную')
  await page.getByRole('textbox', { name: 'Текст сообщения' }).press('Enter')
  await expect(page.getByRole('log')).toContainText('Слишком много запросов')
  expect(calls.filter(call => call.method === 'sendMessage')).toHaveLength(1)
  await page.getByRole('button', { name: 'Повторить отправку' }).click()
  await expect(page.getByLabel('В очереди GREEN-API', { exact: true })).toBeVisible()
  await expect(page.getByRole('log').getByText('Повторяем вручную', { exact: true })).toHaveCount(1)
  expect(calls.filter(call => call.method === 'sendMessage')).toHaveLength(2)
})

test('recovers receiving after a transient server failure', async ({ page }) => {
  await mockApi(page, { retryPoll: true })
  await connect(page)
  await expect(page.getByRole('alert')).toContainText('Повторяем подключение автоматически')
  await expect(page.getByText('Telegram подключён', { exact: true })).toBeVisible()
})

test('handles private phone numbers without creating a broken chat', async ({ page }) => {
  await mockApi(page, { absent: true })
  await connect(page)
  await newChat(page)
  await expect(page.getByRole('alert')).toContainText('номер скрыт')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('demo works without credentials, keeps drafts per chat and preserves text as text', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть демоверсию' }).click()
  await page.getByRole('textbox', { name: 'Текст сообщения' }).fill('<script>alert("hi")</script>')
  await page.getByRole('button', { name: /Команда проекта/ }).click()
  await expect(page.getByRole('textbox', { name: 'Текст сообщения' })).toHaveValue('')
  await page.getByRole('button', { name: /Анна/ }).click()
  await expect(page.getByRole('textbox', { name: 'Текст сообщения' })).toHaveValue('<script>alert("hi")</script>')
  await page.getByRole('button', { name: 'Отправить сообщение' }).click()
  await expect(page.getByRole('log')).toContainText('<script>alert("hi")</script>')
  await expect(page.getByRole('log')).toContainText('Это автоматический ответ демоверсии')
  await page.getByRole('textbox', { name: 'Поиск чатов' }).fill('несуществующий')
  await expect(page.getByText('Ничего не найдено')).toBeVisible()
})
