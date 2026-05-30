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
      <div className="message__bubble-wrapper">
        <p className="message__content">{message.content}</p>
        
        {message.role === 'assistant' && !isStreaming && (
          <div className="message__actions">
            <button className="message__action-btn" onClick={() => navigator.clipboard.writeText(message.content)} title="Copiar texto">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button className="message__action-btn" onClick={() => window.electronAPI.voiceSpeak(message.content)} title="Re-escuchar (Replay TTS)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
            </button>
          </div>
        )}
      </div>
      
      {/* COGNITIVE CONTEXT RENDERING */}
      {message.metadata?.references && message.metadata.references.length > 0 && (
        <div className="message__cognitive-references" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
            Cognitive Context Injected
          </div>
          {message.metadata.references.map((ref, idx) => (
            <div key={idx} className="context-card">
              <div className="context-card-header">
                <span>{ref.title || 'Context Node'}</span>
                <span className="context-card-badge">{ref.type}</span>
              </div>
              <div className="context-card-content">
                {ref.source}
              </div>
              <div className="context-card-footer">
                <span>Confidence: {(ref.confidence * 100).toFixed(0)}%</span>
                {ref.url && (
                  <a href={ref.url} target="_blank" rel="noreferrer" className="context-card-link">
                    Source Link
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
