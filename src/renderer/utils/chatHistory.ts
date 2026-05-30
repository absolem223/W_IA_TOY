import type { ChatMessage } from '../../shared/types'

const STORAGE_KEY = 'widget-ia:chat-history'
const MAX_MESSAGES = 50

/**
 * Load the persisted message history from localStorage.
 * Returns an empty array on any parse error or first run.
 */
export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Basic schema validation: must be an array of {role, content} objects
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m): m is ChatMessage =>
        typeof m === 'object' &&
        m !== null &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
  } catch {
    return []
  }
}

/**
 * Persist the message list to localStorage.
 * Enforces MAX_MESSAGES limit by keeping the most recent ones.
 * Fails silently if quota is exceeded (private mode, storage full).
 */
export function saveHistory(messages: ChatMessage[]): void {
  try {
    const trimmed = messages.slice(-MAX_MESSAGES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Quota exceeded or private browsing — non-fatal
  }
}

/**
 * Wipe the persisted history entirely.
 */
export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
}
