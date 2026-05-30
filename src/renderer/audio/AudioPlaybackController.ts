// ── AudioPlaybackController ───────────────────────────────────
// Dedicated class owning all audio-buffer playback logic.
// Handles Blob/URL lifecycle, ACK callbacks, requestId guards,
// and cleanup. No window.* refs — all state is encapsulated.

export interface AudioPlaybackPayload {
  requestId: string
  mimeType:  string        // 'audio/wav'
  audioBytes: Uint8Array
  durationMs?: number
}

export interface PlaybackCallbacks {
  onStarted: (requestId: string) => void
  onEnded:   (requestId: string, durationMs: number) => void
  onError:   (requestId: string, error: string) => void
}

export class AudioPlaybackController {
  private activeRequestId: string | null = null
  private activeAudio: HTMLAudioElement | null = null
  private activeObjectUrl: string | null = null
  private startTimeMs = 0

  private callbacks: PlaybackCallbacks

  constructor(callbacks: PlaybackCallbacks) {
    this.callbacks = callbacks
  }

  play(payload: AudioPlaybackPayload): void {
    const { requestId, mimeType, audioBytes } = payload

    // If there's already something playing, stop it first
    this._stopCurrent()

    this.activeRequestId = requestId

    let objectUrl: string
    try {
      // Copy to a plain ArrayBuffer so it's accepted by Blob across all TS targets
      const arrayBuffer = audioBytes.buffer.slice(
        audioBytes.byteOffset,
        audioBytes.byteOffset + audioBytes.byteLength
      ) as ArrayBuffer
      const blob = new Blob([arrayBuffer], { type: mimeType })
      objectUrl = URL.createObjectURL(blob)
    } catch (err: any) {
      this.callbacks.onError(requestId, `Failed to create audio blob: ${err?.message ?? String(err)}`)
      this.activeRequestId = null
      return
    }

    this.activeObjectUrl = objectUrl
    const audio = new Audio(objectUrl)
    this.activeAudio = audio
    this.startTimeMs = Date.now()

    audio.onplay = () => {
      // Guard: ensure this is still the active request
      if (this.activeRequestId !== requestId) return
      this.callbacks.onStarted(requestId)
    }

    audio.onended = () => {
      // Guard: ensure this is still the active request
      if (this.activeRequestId !== requestId) return
      const durationMs = Date.now() - this.startTimeMs
      this._revokeUrl()
      this.activeAudio = null
      this.activeRequestId = null
      this.callbacks.onEnded(requestId, durationMs)
    }

    audio.onerror = (event) => {
      // Guard: ensure this is still the active request
      if (this.activeRequestId !== requestId) return
      // HTMLAudioElement errors don't have speech-specific codes
      const errorMsg = (audio.error?.message) ?? `Audio error (code ${audio.error?.code ?? 'unknown'})`
      this._revokeUrl()
      this.activeAudio = null
      this.activeRequestId = null
      this.callbacks.onError(requestId, errorMsg)
    }

    audio.play().catch((err: Error) => {
      // Guard: ensure this is still the active request
      if (this.activeRequestId !== requestId) return
      this._revokeUrl()
      this.activeAudio = null
      this.activeRequestId = null
      this.callbacks.onError(requestId, err?.message ?? 'play() rejected')
    })
  }

  stop(): void {
    this._stopCurrent()
  }

  /**
   * Full cleanup — call on component unmount.
   * Stops playback and revokes any lingering Object URLs.
   */
  destroy(): void {
    this._stopCurrent()
  }

  // ── Private ──

  private _stopCurrent(): void {
    const prevId = this.activeRequestId
    if (this.activeAudio) {
      // Remove handlers before pausing to avoid spurious callbacks
      this.activeAudio.onplay   = null
      this.activeAudio.onended  = null
      this.activeAudio.onerror  = null
      try {
        this.activeAudio.pause()
        this.activeAudio.src = ''
        this.activeAudio.load()
      } catch {
        // Suppress errors from pausing already-ended audio
      }
      this.activeAudio = null
    }
    this._revokeUrl()
    this.activeRequestId = null

    if (prevId) {
      // We do NOT call onEnded or onError here — the Main process
      // already knows it cancelled via 'voice:stop-playback'.
      // Calling back would create a race condition with the queue.
    }
  }

  private _revokeUrl(): void {
    if (this.activeObjectUrl) {
      URL.revokeObjectURL(this.activeObjectUrl)
      this.activeObjectUrl = null
    }
  }
}
