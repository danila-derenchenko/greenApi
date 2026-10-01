import { ArrowUpRight } from 'lucide-react'
import Modal from './Modal'

export default function Help({ onClose }: { onClose: () => void }) {
  return <Modal title="Как подключить Telegram" onClose={onClose}>
    <ol className="setup-steps">
      <li><strong>Создайте инстанс Telegram</strong><p>Откройте личный кабинет GREEN-API, создайте инстанс для Telegram и подключите свой аккаунт по QR-коду. Дождитесь статуса authorized.</p></li>
      <li><strong>Настройте входящие сообщения</strong><p>В настройках инстанса оставьте webhookUrl пустым и включите incomingWebhook. Для статусов доставки включите outgoingWebhook. После сохранения подождите около минуты.</p></li>
      <li><strong>Скопируйте данные доступа</strong><p>Введите apiUrl, idInstance и apiTokenInstance в форму подключения. Токен хранится только в памяти этой вкладки.</p></li>
      <li><strong>Начните разговор</strong><p>Нажмите «Новый чат», введите номер с кодом страны или @username и отправьте сообщение. Ответ собеседника появится автоматически.</p></li>
    </ol>
    <div className="help-note">Используйте одну вкладку для одного инстанса. Переписка в этом приложении хранится до обновления страницы; сообщения остаются в Telegram.</div>
    <p className="field-hint">Выход из приложения не отзывает доступ GREEN-API. Чтобы отозвать его, завершите соответствующую сессию в Telegram → Настройки → Устройства.</p>
    <a className="primary-button full-width" href="https://console.green-api.com/" target="_blank" rel="noreferrer">Открыть GREEN-API <ArrowUpRight size={17} /></a>
    <a className="text-link docs-link" href="https://green-api.com/telegram/docs/before-start/" target="_blank" rel="noreferrer">Инструкция GREEN-API <ArrowUpRight size={14} /></a>
  </Modal>
}
