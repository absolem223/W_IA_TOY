// ── TTS Preprocessing Pipeline ───────────────────────────────
// Transforms AI response text into natural, speakable content.
// Pure functions. Zero side effects.

/**
 * Main entry point: sanitizes text for speech synthesis.
 * Removes markdown, code blocks, URLs, normalizes spacing.
 */
export function sanitizeForSpeech(text: string): string {
  let result = text

  // 1. Remove code blocks (```...```) — replace with brief summary
  result = result.replace(/```[\s\S]*?```/g, ' (bloque de código omitido) ')

  // 2. Remove inline code (`...`)
  result = result.replace(/`([^`]+)`/g, '$1')

  // 3. Remove markdown images ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')

  // 4. Remove markdown links [text](url) — keep text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // 5. Truncate raw URLs
  result = result.replace(/https?:\/\/[^\s)]+/g, '(enlace)')

  // 6. Remove markdown headers (# ## ###)
  result = result.replace(/^#{1,6}\s+/gm, '')

  // 7. Remove bold/italic markers
  result = result.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
  result = result.replace(/_{1,3}([^_]+)_{1,3}/g, '$1')

  // 8. Remove strikethrough
  result = result.replace(/~~([^~]+)~~/g, '$1')

  // 9. Remove blockquotes
  result = result.replace(/^>\s+/gm, '')

  // 10. Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, '')

  // 11. Remove list markers (-, *, 1.)
  result = result.replace(/^\s*[-*]\s+/gm, '')
  result = result.replace(/^\s*\d+\.\s+/gm, '')

  // 12. Normalize emoji — keep common ones, remove unusual sequences
  result = result.replace(/[\u{1F600}-\u{1F64F}]/gu, '') // emoticons
  result = result.replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // symbols & pictographs
  result = result.replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // transport
  result = result.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // flags

  // 13. Remove HTML tags
  result = result.replace(/<[^>]+>/g, '')

  // 14. Normalize whitespace
  result = result.replace(/\n{3,}/g, '\n\n')   // max 2 newlines
  result = result.replace(/[ \t]+/g, ' ')       // collapse spaces
  result = result.replace(/\n /g, '\n')          // trim line starts

  // 15. Final trim
  result = result.trim()

  return result
}

/**
 * Splits text into sentence-sized segments for natural TTS delivery.
 * Each segment is a complete thought that can be spoken independently.
 */
export function segmentForSpeech(text: string, maxSegmentLength = 300): string[] {
  if (!text || text.trim().length === 0) return []

  // Split at sentence boundaries: . ! ? followed by space or newline
  const rawSentences = text.split(/(?<=[.!?])\s+/)
  const segments: string[] = []
  let buffer = ''

  for (const sentence of rawSentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue

    // If adding this sentence would exceed max, flush buffer
    if (buffer.length > 0 && (buffer.length + trimmed.length + 1) > maxSegmentLength) {
      segments.push(buffer.trim())
      buffer = ''
    }

    buffer += (buffer ? ' ' : '') + trimmed
  }

  // Flush remaining
  if (buffer.trim()) {
    segments.push(buffer.trim())
  }

  // If no sentence boundaries were found, split at paragraph breaks
  if (segments.length === 0) {
    return text.split(/\n\n+/).map(s => s.trim()).filter(Boolean)
  }

  return segments
}

/**
 * Applies contextual shortening for system messages.
 * Keeps feedback brief and direct.
 */
export function shortenForFeedback(text: string, maxLength = 100): string {
  const cleaned = sanitizeForSpeech(text)
  if (cleaned.length <= maxLength) return cleaned
  // Cut at the last sentence boundary within limit
  const cut = cleaned.slice(0, maxLength)
  const lastPeriod = cut.lastIndexOf('.')
  if (lastPeriod > maxLength * 0.5) {
    return cut.slice(0, lastPeriod + 1)
  }
  return cut + '…'
}
