import React, { useEffect, useRef, useState } from 'react'
import type { ChatState, ProxyStatus } from '../hooks/useChat'
import { useVoiceService } from '../services/voice'

interface Props {
  onSend:              (text: string, metadata?: Record<string, any>) => void
  /** Insert a pre-transcribed message bubble without triggering the LLM (used by voice flow). */
  onAddUserMessage?:   (text: string, metadata?: Record<string, any>) => void
  onClearChat?:        () => void
  chatState:           ChatState
  proxyStatus:         ProxyStatus
  currentRequestId:    number
  settingsOpen?:       boolean
  onToggleSettings?:   () => void
}

// Placeholder dinámico por estado
const PLACEHOLDERS: Record<ChatState, string> = {
  idle:      'Escribí un mensaje…',
  thinking:  'Procesando…',
  streaming: 'Respondiendo…',
  error:     'Algo salió mal — podés reintentar',
}

// Textos del indicador de estado de voz bajo el botón mic
type VoiceState = 'idle' | 'recording' | 'transcribing' | 'processing' | 'generating'

const VOICE_STATE_LABELS: Partial<Record<VoiceState, string>> = {
  recording:    'Grabando...',
  transcribing: 'Transcribiendo...',
  processing:   'Procesando...',
  generating:   'Generando respuesta...',
}

export function ChatInput({ onSend, onAddUserMessage, onClearChat, chatState, proxyStatus, currentRequestId, settingsOpen, onToggleSettings }: Props): React.ReactElement {
  const [value, setValue] = useState('')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [cmdFeedback, setCmdFeedback] = useState('')
  const cmdFeedbackTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef           = useRef<HTMLTextAreaElement>(null)
  const voiceService       = useVoiceService()

  // Bloqueado durante thinking y streaming, habilitado en idle y error
  const isBlocked = chatState === 'thinking' || chatState === 'streaming'

  // Cuando la respuesta del agente termina, volver a idle desde generating
  useEffect(() => {
    if (chatState === 'idle' && voiceState === 'generating') {
      setVoiceState('idle')
    }
  }, [chatState, voiceState])

  useEffect(() => {
    if (!isBlocked && voiceState === 'idle') {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isBlocked, voiceState])

  // ── VoiceService wiring ──────────────────────────────────────────────────
  useEffect(() => {
    // Mirror provider state changes into the existing voiceState
    const stateSub = voiceService.subscribeState((state) => {
      // VoiceService VoiceState includes 'error'; local type does not → map it
      if (state === 'error') {
        showFeedback('✕ Error al transcribir audio')
        setVoiceState('idle')
        return
      }
      setVoiceState(state as VoiceState)
    })

    // Final transcript → dispatch to LLM via existing onSend pipeline
    const finalSub = voiceService.subscribeFinalTranscript((text) => {
      if (text.trim()) {
        // If it is the open panel command, handle it locally
        const openPanelRegex = /^(abr(e|í) (el )?panel( de)? argos|abrir panel argos|abrir el panel de argos)$/i
        if (openPanelRegex.test(text)) {
          window.electronAPI.setPanelState(true).then(() => {
            showFeedback('Abriendo panel de Argos…')
          }).catch(() => {
            showFeedback('No se pudo abrir el panel')
          })
          setVoiceState('idle')
          return
        }

        setVoiceState('generating')
        // onSend is now handled inside useChat.ts hook directly to ensure LLM response triggers
      } else {
        showFeedback('No se detectó voz o audio vacío')
        setVoiceState('idle')
      }
    })

    return () => {
      stateSub.unsubscribe()
      finalSub.unsubscribe()
    }
  }, [voiceService])

  const handleVoice = async () => {
    // Barge-in / Interruption: si está respondiendo, cancelar
    if (chatState === 'streaming' || chatState === 'thinking') {
      window.electronAPI.cancelChat(currentRequestId)
    }
    window.electronAPI.voiceStop()

    if (voiceState === 'recording') {
      await voiceService.stop()
    } else if (voiceState === 'idle') {
      await voiceService.start()
    }
  }


  // Track pending confirmation for confirmation flow
  const pendingConfirmId = useRef<string | null>(null)

  const showFeedback = (msg: string, duration = 4000) => {
    setCmdFeedback(msg)
    if (cmdFeedbackTimer.current) clearTimeout(cmdFeedbackTimer.current)
    cmdFeedbackTimer.current = setTimeout(() => setCmdFeedback(''), duration)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || isBlocked) return
    // Quick local command: open Argos panel via natural phrase
    const openPanelRegex = /^(abr(e|í) (el )?panel( de)? argos|abrir panel argos|abrir el panel de argos)$/i
    if (openPanelRegex.test(trimmed)) {
      try {
        await window.electronAPI.setPanelState(true)
        showFeedback('Abriendo panel de Argos…')
        setValue('')
      } catch (err) {
        showFeedback('No se pudo abrir el panel')
      }
      return
    }

    // Dispatch slash commands to main process
    if (trimmed.startsWith('/')) {
      console.log('[CHAT_INPUT] Command intercepted:', trimmed)
      setValue('')
      try {
        console.log(`[CHAT_PIPELINE] CHAT_INPUT: Dispatching to actionExecute for '${trimmed}'...`)
        const result = await window.electronAPI.actionExecute(trimmed)
        console.log('[CHAT_PIPELINE] CHAT_INPUT: Result:', result)
        showFeedback(result.message)
        // Track confirmation state
        if (result.data?.needsConfirmation) {
          pendingConfirmId.current = result.data.confirmId as string
        }
        // Handle clear_chat action
        if (result.data?.action === 'clear_chat' && onClearChat) {
          onClearChat()
        }
      } catch (err) {
        console.error('[CHAT_INPUT] actionExecute thrown:', err)
        showFeedback('✕ Command failed')
      }
      console.log('[CHAT_PIPELINE] CHAT_INPUT: Bypassing onSend due to command')
      return
    }

    console.log('[CHAT_PIPELINE] CHAT_INPUT: Sending normal text to LLM:', trimmed)

    // Check if user is responding to a confirmation prompt
    if (pendingConfirmId.current) {
      const lower = trimmed.toLowerCase()
      const confirmId = pendingConfirmId.current
      pendingConfirmId.current = null

      if (['yes', 'y', 'si', 'sí', 'confirm'].includes(lower)) {
        setValue('')
        try {
          const result = await window.electronAPI.actionExecute(`/confirm ${confirmId}`)
          showFeedback(result.message)
          if (result.data?.action === 'clear_chat' && onClearChat) {
            onClearChat()
          }
        } catch {
          showFeedback('✕ Confirm failed')
        }
        return
      } else if (['no', 'n', 'cancel'].includes(lower)) {
        setValue('')
        await window.electronAPI.actionExecute(`/cancel ${confirmId}`)
        showFeedback('✕ Cancelled')
        return
      }
      // User typed something else — cancel silently and proceed as normal message
      await window.electronAPI.actionExecute(`/cancel ${confirmId}`)
    }

    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`
    }
  }

  useEffect(() => {
    if (value === '' && inputRef.current) {
      inputRef.current.style.height = '38px' // Reset to default pill height
    }
  }, [value])

  const voiceLabel = VOICE_STATE_LABELS[voiceState] ?? null
  const isMicBusy = voiceState !== 'idle' && voiceState !== 'recording'

  return (
    <form
      className={`chat-input chat-input--${chatState}`}
      onSubmit={handleSubmit}
    >
      {cmdFeedback && (
        <span className="proxy-badge proxy-badge--memory">{cmdFeedback}</span>
      )}
      {proxyStatus === 'connecting' && !cmdFeedback && (
        <span className="proxy-badge proxy-badge--connecting">Conectando...</span>
      )}
      {proxyStatus === 'connected' && !cmdFeedback && (
        <span className="proxy-badge proxy-badge--connected">Conectado</span>
      )}
      {proxyStatus === 'unavailable' && !cmdFeedback && (
        <span className="proxy-badge proxy-badge--error">Proxy no disponible</span>
      )}

      <textarea
        ref={inputRef}
        id="chat-field"
        className="chat-input__field"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDERS[chatState]}
        disabled={isBlocked}
        autoFocus
        autoComplete="off"
        rows={1}
      />

      <div className="chat-input__buttons">
        {/* Mic button wrapper — columna para colocar el label debajo */}
        <div className="chat-input__mic-wrapper">
          <button
            type="button"
            className={`chat-input__mic ${voiceState === 'recording' ? 'chat-input__mic--active' : ''} ${isMicBusy ? 'chat-input__mic--busy' : ''}`}
            onClick={handleVoice}
            disabled={isMicBusy}
            aria-label={voiceState === 'recording' ? 'Detener grabación' : 'Dictar por voz'}
            title={voiceState === 'recording' ? 'Detener' : (chatState === 'streaming' || chatState === 'thinking') ? 'Interrumpir y Hablar' : 'Dictar por voz'}
          >
            {voiceState === 'recording' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : isMicBusy ? (
              // Spinner sutil para los estados de procesamiento
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" opacity="0.5"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            )}
          </button>
          <span
            className="chat-input__mic-label"
            aria-live="polite"
            style={{ visibility: voiceLabel ? 'visible' : 'hidden' }}
          >
            {voiceLabel ?? '\u00A0'}
          </span>
        </div>

        {/* En streaming: botón cancelar. En otros estados: botón de enviar */}
        {chatState === 'streaming' ? (
          <button
            id="chat-cancel"
            type="button"
            className="chat-input__cancel"
            onClick={() => window.electronAPI.cancelChat(currentRequestId)}
            aria-label="Cancelar respuesta"
            title="Cancelar"
          >
            ■
          </button>
        ) : (
          <button
            id="chat-send"
            className="chat-input__send"
            type="submit"
            disabled={isBlocked || !value.trim()}
            aria-label="Enviar"
          >
            ↑
          </button>
        )}

        {/* Botón de configuración */}
        {onToggleSettings && (
          <button
            type="button"
            className={`voice-controls__gear${settingsOpen ? ' voice-controls__gear--active' : ''}`}
            onClick={onToggleSettings}
            title="Configuración de voz"
            aria-expanded={settingsOpen}
            aria-label="Configuración de voz"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        )}
      </div>
    </form>
  )
}
