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
}: Props): React.ReactElement | null {
  const streamingClass = isStreaming && message.role === 'assistant' ? ' streaming' : ''

  const isSystem = message.metadata?.sessionType === 'system'

  // Ocultar mensajes del sistema que confunden al usuario
  if (isSystem && (
    message.content.includes('Estoy ajustando') ||
    message.content.includes('proceso la informacion') ||
    message.content.includes('Necesito una herramienta cognitiva') ||
    message.content.includes('Voy a utilizar un enfoque') ||
    message.content.includes('modo reducido') ||
    message.content.includes('procesamiento mas completa') ||
    message.content.includes('forma alternativa de procesamiento')
  )) {
    return null
  }

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
      className={`message ${isSystem ? 'message--system' : `message--${message.role}`} delay-v${delayVariant}${streamingClass}`}
      data-event={dataEvent}
    >
      <div className="message__bubble-wrapper">
        <p className="message__content">{message.content}</p>
        {/* 🎤 Voice-transcribed badge */}
        {message.role === 'user' && message.metadata?.fromVoice && (
          <span className="message__voice-badge" title="Transcripción de voz">🎤</span>
        )}
        {isSystem && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
            ⚙︎ Sistema
          </div>
        )}
        
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

        {message.role === 'assistant' && message.metadata?.modelInfo && (
          <div className="message__model-info" data-testid="message-model-info">
            <span className="model-info__tag">
              🤖 {message.metadata.modelInfo.provider} • {message.metadata.modelInfo.model}
            </span>
            <span className="model-info__time">
              🕒 {new Date(message.metadata.modelInfo.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {message.metadata.modelInfo.fallbackReason && (
              <span className="model-info__fallback-reason" title={message.metadata.modelInfo.fallbackReason}>
                ⚠️ Fallback
              </span>
            )}
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
