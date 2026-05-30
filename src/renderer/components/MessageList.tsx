import React, { useEffect, useRef, useCallback } from 'react'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { MemoryUsageIndicator } from './MemoryUsageIndicator'
import type { ChatMessage } from '../../shared/types'
import type { MemoryUsedItem } from '../hooks/useChat'

interface Props {
  messages:      ChatMessage[]
  isStreaming:    boolean
  usedMemories?: MemoryUsedItem[]
  agentStatus?:   string | null
}

/** Scroll throttle interval en ms — invisible para el ojo pero elimina el scroll nervioso */
const SCROLL_THROTTLE_MS = 120

export function MessageList({ messages, isStreaming, usedMemories = [], agentStatus }: Props): React.ReactElement {
  const bottomRef     = useRef<HTMLDivElement>(null)
  const lastScrollRef = useRef<number>(0)
  const rafRef        = useRef<number | null>(null)

  // Throttled scroll con "trailing edge": si un evento llega durante el cooldown,
  // lo programamos para que se ejecute después, garantizando el scroll final.
  const scrollToBottom = useCallback(() => {
    const now = Date.now()
    if (now - lastScrollRef.current < SCROLL_THROTTLE_MS) {
      if (rafRef.current !== null) clearTimeout(rafRef.current)
      rafRef.current = window.setTimeout(() => {
        lastScrollRef.current = Date.now()
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, SCROLL_THROTTLE_MS)
      return
    }
    
    lastScrollRef.current = now
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
    // Cuando el streaming termina, forzamos un scroll final instantáneo
    // para garantizar que el último token haya sido renderizado antes de asentar.
    if (!isStreaming) {
      const t = window.setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      }, 80)
      return () => clearTimeout(t)
    }
  }, [messages, isStreaming, scrollToBottom])

  // Limpieza del timeout pendiente al desmontar
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) clearTimeout(rafRef.current)
    }
  }, [])

  // El último mensaje del assistant recibe la clase "streaming" mientras llega
  const lastAssistantIdx = messages.reduce(
    (acc, msg, i) => (msg.role === 'assistant' ? i : acc),
    -1,
  )

  // Show memory indicator before the last assistant message when streaming
  const showMemoryIndicator = usedMemories.length > 0 && isStreaming

  return (
    <div className="message-list">
      {messages.length === 0 && (
        <p className="message-list__empty">Escribí algo para comenzar…</p>
      )}
      {messages.map((msg, i) => (
        <React.Fragment key={i}>
          {showMemoryIndicator && i === lastAssistantIdx && (
            <MemoryUsageIndicator
              items={usedMemories.map(m => ({ source: m.type, label: m.label }))}
            />
          )}
          <MessageBubble
            message={msg}
            isStreaming={isStreaming && i === lastAssistantIdx}
            delayVariant={(i % 3) as 0 | 1 | 2}
            isFirstResponse={msg.role === 'assistant' && i > 0 && messages[i - 1].role === 'user'}
          />
        </React.Fragment>
      ))}
      {isStreaming && <TypingIndicator status={agentStatus || undefined} />}
      <div ref={bottomRef} />
    </div>
  )
}

