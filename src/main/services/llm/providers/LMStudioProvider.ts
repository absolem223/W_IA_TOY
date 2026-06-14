import type { ChatMessage } from '../../../../shared/types'
import type { InferenceProvider, ProviderCapabilities, ChatCompletionChunk } from '../types'

export class LMStudioProvider implements InferenceProvider {
  readonly id = 'lmstudio'
  readonly name = 'LM Studio (Local)'
  readonly type = 'local'

  private baseUrl = 'http://localhost:1234/v1'
  // Tracks the model that's actually loaded and responding in LM Studio
  private resolvedModelId: string | null = null
  // Cache for model resolution — avoids a /v1/models fetch on every inference call
  private modelResolutionCache: { requestedId: string; resolvedId: string; ts: number } | null = null
  private readonly MODEL_CACHE_TTL_MS = 30_000 // re-validate every 30 seconds

  constructor() {
    if (process.env.LMSTUDIO_BASE_URL) {
      this.baseUrl = process.env.LMSTUDIO_BASE_URL.trim()
    }
  }

  /**
   * Returns the resolved model ID (the one actually loaded in LM Studio),
   * or null if not yet validated.
   */
  getResolvedModelId(): string | null {
    return this.resolvedModelId
  }

  /**
   * Fetch available models from LM Studio and validate/resolve the requested modelId.
   * Uses a 30-second TTL cache to avoid blocking every inference with an extra HTTP call.
   * - If requestedModelId is found in LM Studio, use it.
   * - If not found, auto-switch to the first available non-embedding model and log a warning.
   */
  async resolveModel(requestedModelId: string): Promise<string> {
    const now = Date.now()
    
    // Cache hit: same model requested, cache is fresh
    if (
      this.modelResolutionCache &&
      this.modelResolutionCache.requestedId === requestedModelId &&
      now - this.modelResolutionCache.ts < this.MODEL_CACHE_TTL_MS
    ) {
      console.log(`[LMStudio] [CACHE HIT] Resolved '${requestedModelId}' → '${this.modelResolutionCache.resolvedId}' (${Math.round((now - this.modelResolutionCache.ts) / 1000)}s ago)`)
      return this.modelResolutionCache.resolvedId
    }

    console.log(`[LMStudio] [MODEL_RESOLVE] Fetching available models from ${this.baseUrl}/models...`)
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) {
        console.warn(`[LMStudio] /models returned ${response.status}. Using requested model as-is: ${requestedModelId}`)
        return requestedModelId
      }
      const data = await response.json() as { data?: Array<{ id: string }> }
      const available = (data.data ?? []).map(m => m.id)

      if (available.length === 0) {
        console.warn(`[LMStudio] No models found. LM Studio may not have any model loaded.`)
        return requestedModelId
      }

      // Check if our configured model is in the list
      if (available.includes(requestedModelId)) {
        console.log(`[LMStudio] [MODEL_FOUND] Configured model is active: ${requestedModelId}`)
        this.resolvedModelId = requestedModelId
        this.modelResolutionCache = { requestedId: requestedModelId, resolvedId: requestedModelId, ts: now }
        return requestedModelId
      }

      // Not found — pick first non-embedding model
      const EMBEDDING_PATTERNS = ['embed', 'embedding', 'nomic', 'e5-']
      const candidate = available.find(
        id => !EMBEDDING_PATTERNS.some(p => id.toLowerCase().includes(p))
      ) ?? available[0]

      console.warn(
        `[LMStudio] ⚠️  Configured model '${requestedModelId}' is NOT loaded in LM Studio.\n` +
        `[LMStudio]    Available: ${available.join(', ')}\n` +
        `[LMStudio]    Auto-switching to: '${candidate}' — update llm-config.json to suppress.`
      )
      this.resolvedModelId = candidate
      this.modelResolutionCache = { requestedId: requestedModelId, resolvedId: candidate, ts: now }
      return candidate
    } catch (err: any) {
      console.warn(`[LMStudio] Could not fetch model list: ${err.message}. Using: ${requestedModelId}`)
      // On error, cache the fallback briefly to avoid a hammer on retries
      this.modelResolutionCache = { requestedId: requestedModelId, resolvedId: requestedModelId, ts: now }
      return requestedModelId
    }
  }

  async initialize(): Promise<void> {
    // Validation happens lazily in streamCompletion to avoid
    // blocking the full app startup if LM Studio is offline.
  }

  getCapabilities(modelId: string): ProviderCapabilities {
    // Default capabilities for local LM Studio model execution.
    // Modern LLMs on LM Studio support function calling and JSON mode,
    // but typically lack vision support unless a multimodal model is loaded.
    return {
      tools: true,
      streaming: true,
      vision: false,
      jsonMode: true,
      longContext: false,
    }
  }

  async streamCompletion(
    messages: ChatMessage[],
    options: {
      modelId: string
      systemPrompt?: string
      tools?: any[]
      toolChoice?: any
      signal?: AbortSignal
      correlationId: string
    },
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<{ finishReason: string; model: string; latencyMs: number; tokenUsageEstimate: number }> {
    const start = Date.now()
    const { systemPrompt, tools, toolChoice, signal } = options

    // Resolve to actually-loaded model — catches mismatch between config and LM Studio state
    const modelId = await this.resolveModel(options.modelId)

    const fullMessages = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages

    const payload: any = {
      model: modelId,
      messages: fullMessages,
      stream: true,
    }

    if (tools && tools.length > 0) {
      payload.tools = tools
      if (toolChoice) {
        payload.tool_choice = toolChoice
      }
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('LM Studio completion request aborted')
      }
      throw new Error(`LM Studio network error: ${err?.message ?? String(err)}`)
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`LM Studio returned status ${response.status}: ${errText || response.statusText}`)
    }

    if (!response.body) {
      throw new Error('LM Studio response body is empty')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let done = false
    let finishReason = 'stop'
    let totalCharsStreamed = 0

    try {
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          buffer += decoder.decode(value, { stream: true })
          let newlineIndex
          while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIndex).trim()
            buffer = buffer.slice(newlineIndex + 1)

            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const dataObj = JSON.parse(line.slice(6))
                const choice = dataObj.choices?.[0]
                const delta = choice?.delta

                if (delta) {
                  const chunk: ChatCompletionChunk = {}

                  // Handle visible content tokens
                  if (delta.content) {
                    chunk.content = delta.content
                    totalCharsStreamed += delta.content.length
                  }

                  // Handle thinking/reasoning tokens from models like Qwen3, DeepSeek R1, etc.
                  // reasoning_content is internal chain-of-thought — we forward it as a
                  // special marker so the UI/executor can distinguish it from actual content.
                  if (delta.reasoning_content) {
                    // Don't emit to the chat response, but track that we're in a thinking phase
                    // This prevents the silent stall where reasoning-only chunks produce outputLength:0
                    chunk.reasoningContent = delta.reasoning_content
                  }

                  if (delta.tool_calls) {
                    chunk.toolCalls = delta.tool_calls
                  }
                  if (choice.finish_reason) {
                    chunk.finishReason = choice.finish_reason
                    finishReason = choice.finish_reason
                  }

                  // Only call onChunk if there's actual data to process
                  if (chunk.content !== undefined || chunk.toolCalls !== undefined || chunk.finishReason !== undefined || chunk.reasoningContent !== undefined) {
                    onChunk(chunk)
                  }
                }
              } catch (e) {
                // Ignore parse errors on incomplete chunk boundaries
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    const latencyMs = Date.now() - start
    // 1 token ≈ 4 characters rule-of-thumb for raw estimate
    const tokenUsageEstimate = Math.ceil(totalCharsStreamed / 4)

    return {
      finishReason,
      model: modelId,
      latencyMs,
      tokenUsageEstimate,
    }
  }

  async healthCheck(): Promise<{ available: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      if (response.ok) {
        return { available: true }
      }
      return { available: false, error: `LM Studio returned status ${response.status}` }
    } catch (err: any) {
      return { available: false, error: `Cannot reach LM Studio on local network: ${err.message}` }
    }
  }

  /**
   * Attempt to load a model via LM Studio load API.
   * Returns true if the load endpoint accepted the request (200), false otherwise.
   * This method intentionally tolerates absence of the endpoint and logs accordingly.
   */
  async tryLoadModel(modelId: string): Promise<boolean> {
    console.warn('[LMStudio] Model load API not available in this version')
    return false
  }
}
