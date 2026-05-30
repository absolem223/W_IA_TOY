// ── Voice Controls ───────────────────────────────────────────
// Gear icon opens a collapsible settings panel with:
//   - TTS on/off toggle
//   - Provider selector (web-speech / openai)
//   - Voice selector (fetched from active provider)
//   - Speed, Pitch, Volume sliders
//   - Mute toggle
//   - Test button

import React, { useState, useEffect, useCallback } from 'react'
import type { VoiceState } from '../hooks/useVoice'

interface VoiceInfo {
  id: string
  name: string
  language: string
}

interface Props {
  voiceState:   VoiceState
  enabled:      boolean
  muted:        boolean
  onToggleMute: () => void
  onStop:       () => void
}

export function VoiceControls({ voiceState, enabled, muted, onToggleMute, onStop }: Props): React.ReactElement | null {
  const [open, setOpen]         = useState(false)
  const [voices, setVoices]     = useState<VoiceInfo[]>([])
  const [providerId, setProviderId] = useState('web-speech')
  const [voiceId, setVoiceId]   = useState('')
  const [speed, setSpeed]       = useState(1.0)
  const [pitch, setPitch]       = useState(1.0)
  const [volume, setVolume]     = useState(1.0)
  const [testing, setTesting]   = useState(false)

  const isSpeaking    = voiceState === 'speaking'
  const isGenerating  = voiceState === 'generating'
  const isListening   = voiceState === 'listening'
  const isTranscribing= voiceState === 'transcribing'
  const isInterrupted = voiceState === 'interrupted'
  const isError       = voiceState === 'error'
  const isActive      = isSpeaking || isGenerating || isListening || isTranscribing || isInterrupted || isError

  // ── Load initial status and voices ──
  useEffect(() => {
    window.electronAPI.voiceGetStatus().then(status => {
      setProviderId(status.currentProvider)
      setVoiceId(status.currentVoiceId)
    }).catch(() => {})

    fetchVoices()
  }, [])

  // ── Re-fetch voices when provider changes ──
  const fetchVoices = useCallback(async () => {
    try {
      const list = await window.electronAPI.voiceGetVoices()
      setVoices(list)
    } catch {
      setVoices([])
    }
  }, [])

  // ── Handlers ──

  const handleToggleEnabled = async () => {
    await window.electronAPI.actionExecute(enabled ? '/voice off' : '/voice on')
  }

  const handleProviderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value
    setProviderId(newProvider)
    setVoiceId('') // reset voice when provider changes
    await window.electronAPI.voiceSetConfig({ providerId: newProvider, voiceId: '' })
    // Fetch voices for new provider
    const list = await window.electronAPI.voiceGetVoices()
    setVoices(list)
  }

  const handleVoiceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVoice = e.target.value
    setVoiceId(newVoice)
    await window.electronAPI.voiceSetConfig({ voiceId: newVoice })
  }

  const handleSpeedChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setSpeed(val)
    await window.electronAPI.voiceSetConfig({ speed: val })
  }

  const handlePitchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setPitch(val)
    await window.electronAPI.voiceSetConfig({ pitch: val } as any)
  }

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    await window.electronAPI.voiceSetConfig({ volume: val } as any)
  }

  const handleTest = async () => {
    if (testing) return
    setTesting(true)
    await window.electronAPI.actionExecute('/voice-test')
    setTimeout(() => setTesting(false), 3000)
  }

  return (
    <div className="voice-controls-wrapper">
      {/* ── Collapsible settings panel ─────────────────────────── */}
      <div className={`voice-settings-panel${open ? ' voice-settings-panel--open' : ''}`}>
        <div className="voice-settings-panel__inner">

          {/* TTS on/off */}
          <div className="vsp-row">
            <span className="vsp-label">TTS</span>
            <button
              className={`vsp-toggle${enabled ? ' vsp-toggle--on' : ''}`}
              onClick={handleToggleEnabled}
              title={enabled ? 'Desactivar TTS' : 'Activar TTS'}
            >
              {enabled ? '🔊 ON' : '🔇 OFF'}
            </button>
          </div>

          {/* Provider selector */}
          {enabled && (
            <div className="vsp-row">
              <span className="vsp-label">Proveedor</span>
              <select
                className="vsp-select"
                value={providerId}
                onChange={handleProviderChange}
                title="Seleccionar proveedor de voz"
              >
                <option value="web-speech">Web Speech (local)</option>
                <option value="openai">OpenAI TTS (cloud)</option>
              </select>
            </div>
          )}

          {/* Voice selector */}
          {enabled && voices.length > 0 && (
            <div className="vsp-row">
              <span className="vsp-label">Voz</span>
              <select
                className="vsp-select"
                value={voiceId}
                onChange={handleVoiceChange}
                title="Seleccionar voz"
              >
                <option value="">Sistema</option>
                {voices.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Speed slider */}
          {enabled && (
            <div className="vsp-slider-row">
              <div className="vsp-slider-header">
                <span className="vsp-label">Velocidad</span>
                <span className="vsp-value">{speed.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                className="vsp-slider"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speed}
                onChange={handleSpeedChange}
                title={`Velocidad: ${speed.toFixed(1)}×`}
              />
            </div>
          )}

          {/* Pitch slider — only for web-speech */}
          {enabled && providerId === 'web-speech' && (
            <div className="vsp-slider-row">
              <div className="vsp-slider-header">
                <span className="vsp-label">Tono</span>
                <span className="vsp-value">{pitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                className="vsp-slider"
                min={0.5}
                max={2.0}
                step={0.1}
                value={pitch}
                onChange={handlePitchChange}
                title={`Tono: ${pitch.toFixed(1)}`}
              />
            </div>
          )}

          {/* Volume slider */}
          {enabled && (
            <div className="vsp-slider-row">
              <div className="vsp-slider-header">
                <span className="vsp-label">Volumen</span>
                <span className="vsp-value">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                className="vsp-slider"
                min={0}
                max={1.0}
                step={0.05}
                value={volume}
                onChange={handleVolumeChange}
                title={`Volumen: ${Math.round(volume * 100)}%`}
              />
            </div>
          )}

          {/* Mute */}
          {enabled && (
            <div className="vsp-row">
              <span className="vsp-label">Silencio</span>
              <button
                className={`vsp-toggle${muted ? ' vsp-toggle--muted' : ''}`}
                onClick={onToggleMute}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                )}
                {muted ? ' Silenciado' : ' Activo'}
              </button>
            </div>
          )}

          {/* Test voice */}
          {enabled && (
            <div className="vsp-row">
              <span className="vsp-label">Prueba</span>
              <button
                className="vsp-action"
                onClick={handleTest}
                disabled={testing}
                title="Probar voz"
              >
                {testing ? '⏳ Probando…' : '🎵 Test Voice'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Inline controls row (gear + status) ─────────────────── */}
      <div className="voice-controls" role="toolbar" aria-label="Voice controls">

        {/* Speaking indicator */}
        {enabled && (
          <span
            className={`voice-controls__indicator voice-controls__indicator--${voiceState}`}
            aria-live="polite"
            title={`TTS: ${voiceState}`}
          >
            {isListening    && <span>🎤</span>}
            {isTranscribing && <span>✍️</span>}
            {isGenerating   && <span className="voice-controls__spinner">⚙️</span>}
            {isInterrupted  && <span style={{fontSize:'11px'}}>✋</span>}
            {isError        && <span style={{fontSize:'11px'}} title="Playback Failed">⚠️</span>}
            {isSpeaking     && (
              <span className="voice-controls__bars">
                <span className="voice-controls__bar"/>
                <span className="voice-controls__bar"/>
                <span className="voice-controls__bar"/>
              </span>
            )}
          </span>
        )}

        {/* Stop (only when active) */}
        {isActive && (
          <button
            className="voice-controls__stop"
            onClick={onStop}
            aria-label="Detener voz"
            title="Detener"
            type="button"
          >■</button>
        )}

        {/* ⚙️ Gear — opens/closes the settings panel */}
        <button
          className={`voice-controls__gear${open ? ' voice-controls__gear--active' : ''}`}
          onClick={() => setOpen(o => !o)}
          title="Configuración de voz"
          type="button"
          aria-expanded={open}
          aria-label="Configuración de voz"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
