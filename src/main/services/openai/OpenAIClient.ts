// ── OpenAI Client ─────────────────────────────────────────────
// Single HTTP client for all OpenAI API interactions.
// Centralizes auth, error typing, and AbortSignal support.
// Prepared for future: STT (Whisper), Realtime, Embeddings.

const OPENAI_BASE_URL = 'https://api.openai.com/v1'

// ── Typed Errors ──

export class OpenAIAuthError extends Error {
  constructor(message = 'Missing or invalid OPENAI_API_KEY') {
    super(message)
    this.name = 'OpenAIAuthError'
  }
}

export class OpenAIRateLimitError extends Error {
  constructor(message = 'OpenAI rate limit reached') {
    super(message)
    this.name = 'OpenAIRateLimitError'
  }
}

export class OpenAINetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenAINetworkError'
  }
}

export class OpenAIAbortError extends Error {
  constructor() {
    super('OpenAI request aborted')
    this.name = 'OpenAIAbortError'
  }
}

// ── TTS Options ──

export interface TTSOptions {
  model?: 'tts-1' | 'tts-1-hd'
  voice?: string     // alloy | echo | fable | onyx | nova | shimmer
  speed?: number     // 0.25–4.0
  signal?: AbortSignal
}

export interface TTSResult {
  bytes: Uint8Array
  mimeType: 'audio/wav'
  /** Size in bytes */
  size: number
}

// ── OpenAI Client ──

export class OpenAIClient {
  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? ''
  }

  /** Synthesize text to WAV audio bytes via OpenAI TTS API */
  async tts(text: string, options: TTSOptions = {}): Promise<TTSResult> {
    if (!this.apiKey) {
      throw new OpenAIAuthError()
    }

    const {
      model = 'tts-1',
      voice = 'alloy',
      speed = 1.0,
      signal,
    } = options

    const clampedSpeed = Math.min(4.0, Math.max(0.25, speed))

    let response: Response
    try {
      response = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: text,
          voice,
          speed: clampedSpeed,
          response_format: 'wav',
        }),
        signal,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new OpenAIAbortError()
      throw new OpenAINetworkError(err?.message ?? String(err))
    }

    if (response.status === 401 || response.status === 403) {
      throw new OpenAIAuthError(`OpenAI returned ${response.status}`)
    }
    if (response.status === 429) {
      throw new OpenAIRateLimitError()
    }
    if (!response.ok) {
      throw new OpenAINetworkError(`OpenAI TTS returned ${response.status} ${response.statusText}`)
    }

    let buffer: ArrayBuffer
    try {
      buffer = await response.arrayBuffer()
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new OpenAIAbortError()
      throw new OpenAINetworkError(`Failed to read TTS response body: ${err?.message}`)
    }

    const bytes = new Uint8Array(buffer)

    return {
      bytes,
      mimeType: 'audio/wav',
      size: bytes.byteLength,
    }
  }

  /** Check if the API key is present and the endpoint is reachable */
  async healthCheck(): Promise<{ available: boolean; error?: string }> {
    if (!this.apiKey) {
      return { available: false, error: 'OPENAI_API_KEY not set' }
    }
    // Minimal check: just verify credentials with a short TTS call
    try {
      await this.tts('.', { model: 'tts-1', voice: 'alloy', speed: 1.0 })
      return { available: true }
    } catch (err: any) {
      if (err instanceof OpenAIAuthError) return { available: false, error: err.message }
      if (err instanceof OpenAIRateLimitError) return { available: true } // reachable, just limited
      return { available: false, error: err?.message ?? String(err) }
    }
  }
}
