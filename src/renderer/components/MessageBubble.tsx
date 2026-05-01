import React from 'react'
import type { ChatMessage } from '../../shared/types'

interface Props {
  message:          ChatMessage
  isStreaming?:     boolean
  delayVariant?:    0 | 1 | 2
  /** Verdadero si este mensaje es el primer assistant response tras un user message.
   *  Usado para data-event semántico (hook de futura capa sonora). */
  isFirstResponse?: boolean
}

export function MessageBubble({
  message,
  isStreaming    = false,
  delayVariant   = 1,
  isFirstResponse = false,
}: Props): React.ReactElement {
  const streamingClass = isStreaming && message.role === 'assistant' ? ' streaming' : ''

  // Evento semántico — mapea puntos de sincronización para futura capa sonora.
  // No afecta estilos ni animaciones.
  const dataEvent =
    message.role === 'user'
      ? 'user-send'
      : isFirstResponse
        ? 'assistant-first-response'
        : 'message-in'

  return (
    <div
      className={`message message--${message.role} delay-v${delayVariant}${streamingClass}`}
      data-event={dataEvent}
    >
      <p className="message__content">{message.content}</p>
    </div>
  )
}
