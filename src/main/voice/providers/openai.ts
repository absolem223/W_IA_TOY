// ── OpenAI Voice Provider ─────────────────────────────────────
// Implements VoiceProvider using OpenAI TTS API.
// Delegates HTTP to OpenAIClient. Returns audio/wav bytes.

import type {
  VoiceProvider,
  VoiceInfo,
  SynthesizeOptions,
  SynthesizeResult,
  HealthCheckResult,
  ProviderCapabilities,
} from '../types'
import {
  OpenAIClient,
  OpenAIAuthError,
  OpenAIAbortError,
  type TTSOptions,
} from '../../services/openai/OpenAIClient'

// Static list of available OpenAI TTS voices
const OPENAI_VOICES: VoiceInfo[] = [
  { id: 'alloy',   name: 'Alloy',   language: 'multilingual' },
  { id: 'ash',     name: 'Ash',     language: 'multilingual' },
  { id: 'coral',   name: 'Coral',   language: 'multilingual' },
  { id: 'echo',    name: 'Echo',    language: 'multilingual' },
  { id: 'fable',   name: 'Fable',   language: 'multilingual' },
  { id: 'onyx',    name: 'Onyx',    language: 'multilingual' },
  { id: 'nova',    name: 'Nova',    language: 'multilingual' },
  { id: 'sage',    name: 'Sage',    language: 'multilingual' },
  { id: 'shimmer', name: 'Shimmer', language: 'multilingual' },
]

export class OpenAIVoiceProvider implements VoiceProvider {
  readonly id   = 'openai'
  readonly name = 'OpenAI TTS'
  readonly type = 'cloud' as const

  private client: OpenAIClient
  private activeAbort: AbortController | null = null

  constructor() {
    this.client = new OpenAIClient()
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.OPENAI_API_KEY)
  }

  async getVoices(): Promise<VoiceInfo[]> {
    return OPENAI_VOICES
  }

  async synthesize(text: string, options: SynthesizeOptions): Promise<SynthesizeResult> {
    // Cancel any in-flight request
    this.activeAbort?.abort()
    this.activeAbort = new AbortController()

    const ttsOptions: TTSOptions = {
      model: 'tts-1',
      voice:  options.voiceId ?? 'alloy',
      speed:  options.speed   ?? 1.0,
      signal: this.activeAbort.signal,
    }

    const result = await this.client.tts(text, ttsOptions)
    this.activeAbort = null

    return {
      method:    'audio-buffer',
      audioBytes: result.bytes,
      mimeType:  result.mimeType,
      // WAV files don't carry explicit duration; estimate from size
      // PCM 16-bit, 24kHz mono: bytes / (24000 * 2) * 1000 ms
      durationEstimateMs: Math.round((result.size / (24000 * 2)) * 1000),
    }
  }

  stop(): void {
    if (this.activeAbort) {
      this.activeAbort.abort()
      this.activeAbort = null
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const check = await this.client.healthCheck()
    return {
      available:  check.available,
      voiceCount: OPENAI_VOICES.length,
      error:      check.error,
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      synthesis:      true,
      streaming:      false,
      requiresNetwork: true,
      abortable:      true,
      maxTextLength:  4096,
    }
  }

  async dispose(): Promise<void> {
    this.stop()
  }
}
