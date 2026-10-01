export const MAX_MESSAGE_LENGTH = 4096

export function isValidMessage(text: string): boolean {
  return text.trim().length > 0 && text.length <= MAX_MESSAGE_LENGTH
}
