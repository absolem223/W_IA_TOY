/**
 * providers/MediaRecorderProvider.ts — Argos Voice Service
 *
 * Implements native microphone capture using Chromium's MediaRecorder API.
 * Purpose:
 *   - Request and validate microphone hardware permissions.
 *   - Ingest real audio from getUserMedia.
 *   - Implement proper start, stop, cancel, and destroy operations.
 *   - Simulate transcription locally by emitting a test transcript.
 *
 * Lifecycle and State Transitions:
 *   - start()  ➔ solicita permiso ➔ inicia MediaRecorder ➔ estado: 'recording'
 *   - stop()   ➔ detiene MediaRecorder ➔ estado: 'transcribing' ➔ emite transcript ➔ estado: 'idle'
 *   - cancel() ➔ detiene y limpia stream ➔ estado: 'idle' (sin transcript)
 */

import { BaseVoiceProvider } from '../VoiceProvider'
import { convertToWav } from '../../../utils/audioUtils'

export class MediaRecorderProvider extends BaseVoiceProvider {
  readonly id = 'media-recorder'

  private _mediaRecorder: MediaRecorder | null = null
  private _stream: MediaStream | null = null
  private _running = false
  private _isCancelled = false
  private _transcriptionTimer: ReturnType<typeof setTimeout> | null = null

  async start(): Promise<void> {
    if (this._running) {
      console.warn('[MediaRecorderProvider] start() called but already running')
      return
    }
    this._running = true
    this._isCancelled = false

    try {
      console.info('[MediaRecorderProvider] Requesting microphone permissions')
      // 1. Solicitación dinámica de permisos y captura del stream de audio
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // 2. Inicialización de MediaRecorder
      this._mediaRecorder = new MediaRecorder(this._stream)
      const chunks: BlobPart[] = []

      this._mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      this._mediaRecorder.onstop = async () => {
        // Liberar hardware inmediatamente deteniendo todos los tracks
        this._cleanupStream()

        if (this._isCancelled) {
          console.info('[MediaRecorderProvider] Capture cancelled. Audio discarded.')
          this._emitStateChange('idle')
          this._running = false
          return
        }

        // Transición a estado transcribiendo
        this._emitStateChange('transcribing')

        try {
          const blob = new Blob(chunks, { type: 'audio/webm' })
          const arrayBuffer = await blob.arrayBuffer()
          const wavBuffer = await convertToWav(arrayBuffer)

          if (this._isCancelled) {
            this._emitStateChange('idle')
            this._running = false
            return
          }

          const transcript = await window.electronAPI.transcribeAudio(wavBuffer, 'audio/wav')

          if (this._isCancelled) {
            this._emitStateChange('idle')
            this._running = false
            return
          }

          this._emitFinalTranscript(transcript || '')
          this._emitStateChange('idle')
          this._running = false
        } catch (err: any) {
          console.error('[MediaRecorderProvider] Transcription failed:', err)
          this._emitStateChange('error')
          this._running = false
          this._emitFinalTranscript('')
        }
      }

      // 3. Comenzar la grabación
      this._mediaRecorder.start()
      this._emitStateChange('recording')
      console.info('[MediaRecorderProvider] Capture active')

    } catch (err) {
      // Limpieza defensiva ante errores de hardware/permisos denegados
      this._cleanupStream()
      this._running = false
      this._emitStateChange('error')
      console.error('[MediaRecorderProvider] Failed to start capture:', err)
      throw err // Relanzar para que la UI o servicio lo registre
    }
  }

  async stop(): Promise<void> {
    if (!this._running || !this._mediaRecorder || this._mediaRecorder.state === 'inactive') {
      console.warn('[MediaRecorderProvider] stop() called but not actively capturing')
      return
    }

    console.info('[MediaRecorderProvider] Stopping capture')
    this._mediaRecorder.stop()
  }

  async cancel(): Promise<void> {
    if (!this._running) {
      return
    }

    console.info('[MediaRecorderProvider] Cancelling active capture')
    this._isCancelled = true

    // Limpiar cualquier timer de transcripción en curso
    if (this._transcriptionTimer !== null) {
      clearTimeout(this._transcriptionTimer)
      this._transcriptionTimer = null
    }

    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      this._mediaRecorder.stop()
    } else {
      this._cleanupStream()
      this._emitStateChange('idle')
      this._running = false
    }
  }

  async destroy(): Promise<void> {
    console.info('[MediaRecorderProvider] Destroying provider and releasing locks')
    await this.cancel()
  }

  private _cleanupStream(): void {
    if (this._stream) {
      this._stream.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch (e) {
          console.error('[MediaRecorderProvider] Error stopping track:', e)
        }
      })
      this._stream = null
    }
    this._mediaRecorder = null
  }
}
