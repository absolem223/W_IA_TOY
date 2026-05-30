// ── Web Speech API Provider ──────────────────────────────────
// Uses Chromium's built-in SpeechSynthesis API.
// Synthesis is delegated to the renderer (it owns the AudioContext).
// This provider just validates and returns a 'web-speech' result type
// that tells the renderer to use speechSynthesis.speak().

import type {
  VoiceProvider,
  VoiceInfo,
  SynthesizeOptions,
  SynthesizeResult,
  HealthCheckResult,
  ProviderCapabilities,
} from '../types'
import { VOICE_LIMITS } from '../types'

export class WebSpeechProvider implements VoiceProvider {
  readonly id = 'web-speech'
  readonly name = 'Web Speech API'
  readonly type = 'local' as const

  private aborted = false

  async isAvailable(): Promise<boolean> {
    // Web Speech API is built into Chromium/Electron — always available
    return true
  }

  async getVoices(): Promise<VoiceInfo[]> {
    // Voices are only available in the renderer (speechSynthesis).
    // This returns an empty list; the renderer enumerates voices directly.
    return []
  }

  async synthesize(text: string, _options: SynthesizeOptions): Promise<SynthesizeResult> {
    this.aborted = false

    if (!text || text.trim().length === 0) {
      throw new Error('Empty text')
    }

    // Enforce text length limit
    const truncated = text.length > VOICE_LIMITS.MAX_TEXT_LENGTH
      ? text.slice(0, VOICE_LIMITS.MAX_TEXT_LENGTH)
      : text

    if (this.aborted) {
      throw new Error('Synthesis aborted')
    }

    // Web Speech API: we just return the text.
    // The renderer will call speechSynthesis.speak() with it.
    // Estimated duration: ~150ms per word (rough average)
    const wordCount = truncated.split(/\s+/).length
    const durationEstimateMs = wordCount * 150

    return {
      method: 'web-speech',
      text: truncated,
      durationEstimateMs,
    }
  }

  stop(): void {
    this.aborted = true
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      available: true,
      voiceCount: 0, // renderer enumerates
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      synthesis: true,
      streaming: false,
      requiresNetwork: false,
      abortable: false,   // Web Speech API doesn't support AbortSignal natively
      maxTextLength: VOICE_LIMITS.MAX_TEXT_LENGTH,
    }
  }
}
