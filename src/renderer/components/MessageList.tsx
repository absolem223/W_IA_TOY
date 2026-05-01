import React, { useEffect, useRef, useCallback } from 'react'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import type { ChatMessage } from '../../shared/types'

interface Props {
  messages:    ChatMessage[]
  isStreaming: boolean
}

/** Scroll throttle interval en ms — invisible para el ojo pero elimina el scroll nervioso */
const SCROLL_THROTTLE_MS = 120

export function MessageList({ messages, isStreaming }: Props): React.ReactElement {
  const bottomRef     = useRef<HTMLDivElement>(null)
  const lastScrollRef = useRef<number>(0)
  const rafRef        = useRef<number | null>(null)

  // Throttled scroll: máximo una llamada cada SCROLL_THROTTLE_MS
  const scrollToBottom = useCallback(() => {
    const now = Date.now()
    if (now - lastScrollRef.current < SCROLL_THROTTLE_MS) return
    lastScrollRef.current = now
    // rAF para alinear con el ciclo de pintura
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isStreaming, scrollToBottom])

  // Limpieza del rAF pendiente al desmontar
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // El último mensaje del assistant recibe la clase "streaming" mientras llega
  const lastAssistantIdx = messages.reduce(
    (acc, msg, i) => (msg.role === 'assistant' ? i : acc),
    -1,
  )

  return (
    <div className="message-list">
      {messages.length === 0 && (
        <p className="message-list__empty">Escribí algo para comenzar…</p>
      )}
      {messages.map((msg, i) => (
        <MessageBubble
          key={i}
          message={msg}
          isStreaming={isStreaming && i === lastAssistantIdx}
          delayVariant={(i % 3) as 0 | 1 | 2}
          isFirstResponse={msg.role === 'assistant' && i > 0 && messages[i - 1].role === 'user'}
        />
      ))}
      {isStreaming && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  )
}
