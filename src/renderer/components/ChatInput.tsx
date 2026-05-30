import React, { useEffect, useRef, useState } from 'react'
import type { ChatState, ProxyStatus } from '../hooks/useChat'
import { convertToWav } from '../utils/audioUtils'

interface Props {
  onSend:           (text: string) => void
  onClearChat?:     () => void
  chatState:        ChatState
  proxyStatus:      ProxyStatus
  currentRequestId: number
}

// Placeholder dinámico por estado
const PLACEHOLDERS: Record<ChatState, string> = {
  idle:      'Escribí un mensaje…',
  thinking:  'Procesando…',
  streaming: 'Respondiendo…',
  error:     'Algo salió mal — podés reintentar',
}

function getVoiceErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const message = raw.replace(/^Error invoking remote method 'voice:transcribe': Error:\s*/, '')

  return message
}

export function ChatInput({ onSend, onClearChat, chatState, proxyStatus, currentRequestId }: Props): React.ReactElement {
  const [value, setValue] = useState('')
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [cmdFeedback, setCmdFeedback] = useState('')
  const cmdFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)
  const finalTextRef = useRef<string>('')

  // Bloqueado durante thinking y streaming, habilitado en idle y error
  const isBlocked = chatState === 'thinking' || chatState === 'streaming'

  useEffect(() => {
    if (!isBlocked && voiceState === 'idle') {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isBlocked, voiceState])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      finalTextRef.current = value ? value + (value.endsWith(' ') ? '' : ' ') : ''

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      recorder.onstart = () => {
        setVoiceState('recording')
      }

      recorder.onstop = async () => {
        setVoiceState('transcribing')
        const blob = new Blob(chunks, { type: recorder.mimeType })
        stream.getTracks().forEach(track => track.stop())
        
        try {
          const buffer = await blob.arrayBuffer()
          const wavBuffer = await convertToWav(buffer)
          const text = await window.electronAPI.transcribeAudio(wavBuffer, 'audio/wav')
          
          setValue(prev => {
            return (prev ? `${prev} ` : '') + text
          })
          setVoiceState('idle')
        } catch (err: any) {
          setVoiceState('idle')
          setValue(prev => {
            return (prev ? `${prev} ` : '') + `[Error STT: ${getVoiceErrorMessage(err)}]`
          })
        }
      }

      recorder.start()
      recognitionRef.current = recorder
    } catch (err: any) {
      setVoiceState('idle')
      setValue(prev => (prev ? `${prev} ` : '') + `[Error Mic: ${getVoiceErrorMessage(err)}]`)
    }
  }

  const stopRecording = () => {
    if (voiceState !== 'recording') return
    recognitionRef.current?.stop()
  }

  const handleVoice = async () => {
    // Barge-in / Interruption Handling
    // If the system is currently talking or generating, abort it immediately.
    if (chatState === 'streaming' || chatState === 'thinking') {
      window.electronAPI.cancelChat(currentRequestId)
    }
    window.electronAPI.voiceStop()

    if (voiceState === 'recording') {
      stopRecording()
      return
    }

    try {
      await startRecording()
    } catch (err: any) {
      setVoiceState('idle')
      setValue(prev => (prev ? `${prev} ` : '') + `[Error Mic: ${getVoiceErrorMessage(err)}]`)
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

  return (
    <form
      className={`chat-input chat-input--${chatState}`}
      onSubmit={handleSubmit}
    >
      {cmdFeedback && (
        <span className="proxy-badge proxy-badge--memory">{cmdFeedback}</span>
      )}
      {proxyStatus === 'connecting' && !cmdFeedback && (
        <span className="proxy-badge">Conectando...</span>
      )}
      {proxyStatus === 'unavailable' && !cmdFeedback && (
        <span className="proxy-badge proxy-badge--error">Proxy no disponible</span>
      )}
      {voiceState === 'transcribing' && !cmdFeedback && (
        <span className="proxy-badge proxy-badge--transcribing">Escuchando...</span>
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
      <button
        type="button"
        className={`chat-input__mic ${voiceState !== 'idle' ? 'chat-input__mic--active' : ''}`}
        onClick={handleVoice}
        aria-label={voiceState === 'recording' ? 'Detener grabación' : 'Dictar por voz'}
        title={voiceState === 'recording' ? 'Detener' : (chatState === 'streaming' || chatState === 'thinking') ? 'Interrumpir y Hablar' : 'Dictar por voz'}
      >
        {voiceState === 'idle' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        )}
      </button>

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
    </form>
  )
}
