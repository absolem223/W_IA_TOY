// ── Voice Layer — Type Definitions ───────────────────────────
// Pure types. Zero runtime code.

// ── State Machine ──

export type VoiceState = 'idle' | 'generating' | 'speaking' | 'interrupted' | 'error'

export type StateTransitionReason =
  | 'speak'
  | 'synthesis_complete'
  | 'playback_done'
  | 'cancel'
  | 'replace'
  | 'error'
  | 'timeout'
  | 'muted'
  | 'renderer_crash'
  | 'shutdown'

export interface StateTransition {
  from: VoiceState
  to: VoiceState
  reason: StateTransitionReason
  requestId: string
  timestamp: string
}

// ── Provider ──

export interface VoiceInfo {
  id: string
  name: string
  language: string
  gender?: 'male' | 'female' | 'neutral'
  /** True if this voice requires a cloud API call */
  isCloud?: boolean
}

export interface SynthesizeOptions {
  voiceId?: string
  speed?: number       // 0.5 - 2.0, default 1.0
  signal?: AbortSignal
}

export interface SynthesizeResult {
  /**
   * Delivery method:
   *   web-speech   — renderer uses SpeechSynthesis API (current)
   *   audio-buffer — main sends Uint8Array audio bytes to renderer (OpenAI, ElevenLabs, Piper)
   *   streaming    — main streams audio chunks to renderer (future: Gemini Live, OpenAI Realtime)
   */
  method: 'web-speech' | 'audio-buffer' | 'streaming'
  /** web-speech: text to pass to speechSynthesis.speak() */
  text?: string
  /** audio-buffer: raw audio bytes (WAV, PCM, etc.) */
  audioBytes?: Uint8Array
  durationEstimateMs?: number
  /** MIME type for audio-buffer delivery (e.g. 'audio/wav') */
  mimeType?: string
}

export interface HealthCheckResult {
  available: boolean
  voiceCount: number
  latencyMs?: number
  error?: string
}

/** Describes what a provider supports — used by VoiceManager to adapt behavior */
export interface ProviderCapabilities {
  /** Provider can synthesize complete text to audio */
  synthesis: boolean
  /** Provider can stream audio chunks (future) */
  streaming: boolean
  /** Provider requires internet connectivity */
  requiresNetwork: boolean
  /** Provider supports AbortSignal cancellation */
  abortable: boolean
  /** Maximum text length, 0 = unlimited */
  maxTextLength: number
}

export interface VoiceProvider {
  readonly id: string
  readonly name: string
  readonly type: 'local' | 'cloud'

  isAvailable(): Promise<boolean>
  getVoices(): Promise<VoiceInfo[]>
  synthesize(text: string, options: SynthesizeOptions): Promise<SynthesizeResult>
  stop(): void
  healthCheck(): Promise<HealthCheckResult>
  /** Provider capabilities — used by VoiceManager to adapt behavior */
  getCapabilities(): ProviderCapabilities
  /** Optional cleanup when provider is unregistered or app shuts down */
  dispose?(): void | Promise<void>
}

// ── Config: Persistent settings (survives restarts) ──

export interface VoiceSettings {
  providerId: string     // active provider
  voiceId: string        // active voice within provider
  speed: number          // 0.5 - 2.0
  pitch: number          // 0.5 - 2.0, default 1.0
  volume: number         // 0.0 - 1.0, default 1.0
  enabled: boolean       // /voice on|off — default OFF
  muted: boolean         // instant mute toggle
}

/** @deprecated Use VoiceSettings. Kept for backwards compat. */
export type VoiceConfig = VoiceSettings

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  muted: false,
  providerId: 'web-speech',
  voiceId: '',            // empty = system default
  speed: 1.0,
  pitch: 1.0,
  volume: 1.0,
}

/** @deprecated Use DEFAULT_VOICE_SETTINGS */
export const DEFAULT_VOICE_CONFIG = DEFAULT_VOICE_SETTINGS

// ── Runtime State (ephemeral, resets on restart) ──

export interface VoiceRuntimeState {
  state: VoiceState
  currentRequestId: string
  currentText: string
  isAudioPlaying: boolean
  isProcessingQueue: boolean
}

// ── Status (composed view exposed to renderer) ──

export interface VoiceStatus {
  state: VoiceState
  enabled: boolean
  muted: boolean
  currentProvider: string
  currentVoiceId: string
  currentText?: string
  currentRequestId?: string
}

// ── IPC Payloads ──

export interface SpeakRequest {
  text: string
}

export interface PlayTextCommand {
  requestId: string
  text: string
  voiceId?: string
  speed?: number
  pitch?: number
  volume?: number
  /** Optional: numeric chat request id this TTS originates from */
  originChatRequestId?: number
}

/** Payload for audio-buffer delivery via IPC */
export interface AudioBufferPayload {
  requestId: string
  mimeType: string           // 'audio/wav'
  audioBytes: Uint8Array
  durationMs?: number        // optional estimate for telemetry/sync
}

export interface PlaybackEvent {
  requestId: string
  durationMs?: number
  error?: string
}

export interface StateChangedEvent {
  state: VoiceState
  previousState: VoiceState
  reason: StateTransitionReason
  requestId: string
}

// ── Telemetry ──

export interface VoiceTelemetry {
  // Request counts
  totalSpeakRequests: number
  totalCancellations: number
  totalReplacements: number
  totalTimeouts: number
  totalErrors: number
  // Playback stats
  totalCharsSpoken: number
  totalPlaybackMs: number
  lastPlaybackDurationMs: number
  // Cloud TTS stats
  totalAudioSizeBytes: number
  lastGenerationLatencyMs: number
  lastAudioSizeBytes: number
  // Errors
  lastError: string
  lastRequestId: string
  // Provider breakdown
  providerUsage: Record<string, number>
}

// ── Constants ──

export const VOICE_LIMITS = {
  MAX_TEXT_LENGTH: 5000,       // chars — Web Speech API limit
  SYNTHESIS_TIMEOUT_MS: 15000, // 15s max to generate
  PLAYBACK_TIMEOUT_MS: 120000, // 2min max playback
  MAX_QUEUE_SIZE: 5,
} as const
