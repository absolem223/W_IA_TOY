// ── useVoice Hook ────────────────────────────────────────────
// Manages voice state in the renderer.
// Playback logic lives in AudioPlaybackController.
// This hook only wires IPC events, exposes state, and calls the controller.

import { useEffect, useRef, useState, useCallback } from 'react'
import { AudioPlaybackController } from '../audio/AudioPlaybackController'

export type VoiceState =
  | 'idle'
  | 'generating'
  | 'speaking'
  | 'interrupted'
  | 'listening'
  | 'transcribing'
  | 'error'

export interface UseVoiceReturn {
  voiceState: VoiceState
  enabled:    boolean
  muted:      boolean
  toggleMute: () => void
  stop:       () => void
}

export function useVoice(): UseVoiceReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [enabled, setEnabled]       = useState(false)
  const [muted, setMuted]           = useState(false)

  const isMountedRef   = useRef(true)
  const controllerRef  = useRef<AudioPlaybackController | null>(null)

  useEffect(() => {
    isMountedRef.current = true

    // ── Instantiate controller with ACK callbacks ──
    const controller = new AudioPlaybackController({
      onStarted: (requestId) => {
        window.electronAPI.voicePlaybackStarted(requestId)
      },
      onEnded: (requestId, durationMs) => {
        window.electronAPI.voicePlaybackEnded(requestId, durationMs)
      },
      onError: (requestId, error) => {
        console.error(`[VOICE_RENDERER] Audio error for ${requestId}: ${error}`)
        window.electronAPI.voicePlaybackError(requestId, error)
      },
    })
    controllerRef.current = controller

    // ── Fetch initial status ──
    window.electronAPI.voiceGetStatus().then(status => {
      if (!isMountedRef.current) return
      setVoiceState(status.state as VoiceState)
      setEnabled(status.enabled)
      setMuted(status.muted)
      window.electronAPI.voiceRendererReady?.()
    }).catch(() => {
      window.electronAPI.voiceRendererReady?.()
    })

    // ── IPC Listeners ──

    // State changes from Main
    const cleanupState = window.electronAPI.onVoiceStateChanged((event) => {
      if (!isMountedRef.current) return
      setVoiceState(event.state as VoiceState)
    })

    // Config changes from Main (enabled/muted/provider)
    const cleanupConfig = window.electronAPI.onVoiceConfigChanged((config) => {
      if (!isMountedRef.current) return
      setEnabled(config.enabled)
      setMuted(config.muted)
    })

    // Track active chat request id so we can correlate incoming play commands.
    const activeChatRequestIdRef = { current: null as number | null }
    const cleanupChatStart = window.electronAPI.onStart((reqId) => {
      activeChatRequestIdRef.current = reqId
    })
    const cleanupChatDone = window.electronAPI.onDone((reqId) => {
      if (activeChatRequestIdRef.current === reqId) activeChatRequestIdRef.current = null
    })

    // Web Speech playback commands from Main
    const cleanupPlay = window.electronAPI.onVoicePlayText((cmd) => {
      if (!isMountedRef.current) return
      try {
        const origin = (cmd as any).originChatRequestId as number | undefined
        if (typeof origin === 'number' && activeChatRequestIdRef.current !== origin) {
          console.info(`[VOICE_RENDERER] Ignoring stale play-text for origin ${origin} (active ${activeChatRequestIdRef.current})`)
          return
        }
      } catch (e) {
        // If anything fails, fall back to playing
      }
      playWithWebSpeech(cmd.requestId, cmd.text, cmd.voiceId, cmd.speed)
    })

    // Audio buffer playback commands from Main (cloud TTS)
    const cleanupPlayAudio = window.electronAPI.onVoicePlayAudio((payload) => {
      if (!isMountedRef.current) return
      controllerRef.current?.play(payload)
    })

    // Stop commands from Main
    const cleanupStop = window.electronAPI.onVoiceStopPlayback(() => {
      stopWebSpeech()
      controllerRef.current?.stop()
    })

    // Web Speech API Watchdog — prevents Chromium from silently halting long synthesis
    const watchdogTimer = setInterval(() => {
      if (!isMountedRef.current) return
      if (window.speechSynthesis?.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }
    }, 10000)

    // ── Centralized cleanup ──
    return () => {
      isMountedRef.current = false
      clearInterval(watchdogTimer)
      cleanupState()
      cleanupConfig()
      cleanupPlay()
      cleanupPlayAudio()
      cleanupStop()
      cleanupChatStart()
      cleanupChatDone()
      stopWebSpeech()
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [])

  // ── Web Speech API Playback (web-speech provider) ──

  const activeWebSpeechId = useRef<string | null>(null)
  const webSpeechStartTime = useRef<number>(0)

  const playWithWebSpeech = useCallback((
    requestId: string,
    text: string,
    voiceId?: string,
    speed?: number,
  ) => {
    const api = window.electronAPI

    if (!('speechSynthesis' in window)) {
      console.error(`[VOICE_RENDERER] speechSynthesis API missing`)
      api.voicePlaybackError(requestId, 'speechSynthesis not available')
      return
    }

    // Recover from suspended state
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume()
    }

    activeWebSpeechId.current = requestId

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate   = speed ?? 1.0
    utterance.lang   = 'es-AR'

    // Try to match requested voice
    if (voiceId) {
      const voices = window.speechSynthesis.getVoices()
      const match  = voices.find(v => v.name === voiceId || v.voiceURI === voiceId)
      if (match) utterance.voice = match
    }

    // Chromium GC bug: keep reference alive
    // @ts-expect-error — prevents utterance GC during synthesis
    window.__activeUtterance = utterance

    utterance.onstart = () => {
      // Guard
      if (activeWebSpeechId.current !== requestId) return
      webSpeechStartTime.current = Date.now()
      window.electronAPI.voicePlaybackStarted(requestId)
    }

    utterance.onend = () => {
      // Guard
      if (activeWebSpeechId.current !== requestId) return
      const durationMs = Date.now() - webSpeechStartTime.current
      activeWebSpeechId.current = null
      window.electronAPI.voicePlaybackEnded(requestId, durationMs)
    }

    utterance.onerror = (event) => {
      // Guard
      if (activeWebSpeechId.current !== requestId) return
      // Web Speech API uses US English: 'canceled' (not 'cancelled'), 'interrupted' for stops
      if (event.error === 'interrupted' || event.error === 'canceled') return
      activeWebSpeechId.current = null
      window.electronAPI.voicePlaybackError(requestId, event.error || 'Unknown speech error')
    }

    window.speechSynthesis.speak(utterance)
  }, [])

  const stopWebSpeech = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    activeWebSpeechId.current = null
  }, [])

  // ── Controls ──

  const toggleMute = useCallback(() => {
    const newMuted = !muted
    setMuted(newMuted)
    window.electronAPI.voiceSetConfig({ muted: newMuted })
  }, [muted])

  const stop = useCallback(() => {
    stopWebSpeech()
    controllerRef.current?.stop()
    window.electronAPI.voiceStop()
  }, [stopWebSpeech])

  return { voiceState, enabled, muted, toggleMute, stop }
}
