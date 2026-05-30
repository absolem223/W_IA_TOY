import type { ChatMessage } from '../../../../shared/types'
import type { InferenceProvider, ProviderCapabilities, ChatCompletionChunk } from '../types'

export class OpenRouterProvider implements InferenceProvider {
  readonly id = 'openrouter'
  readonly name = 'OpenRouter (Cloud)'
  readonly type = 'cloud'

  private baseUrl = 'https://openrouter.ai/api/v1'

  constructor() {
    if (process.env.OPENROUTER_BASE_URL) {
      this.baseUrl = process.env.OPENROUTER_BASE_URL.trim()
    }
  }

  async initialize(): Promise<void> {
    // No-op initialization
  }

  getCapabilities(modelId: string): ProviderCapabilities {
    const isVisionModel = modelId.includes('vision') || modelId.includes('claude-3') || modelId.includes('gpt-4o')
    const isLongContext = modelId.includes('3.3') || modelId.includes('3.1') || modelId.includes('405b') || modelId.includes('gemma-4')

    return {
      tools: true,
      streaming: true,
      vision: isVisionModel,
      jsonMode: true,
      longContext: isLongContext,
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
    const { modelId, systemPrompt, tools, toolChoice, signal } = options

    const apiKey = process.env.API_KEY || process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      throw new Error('API_KEY is not configured in environment (check .env file)')
    }

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
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/widget-ia-toy',
          'X-Title': 'Argos',
        },
        body: JSON.stringify(payload),
        signal,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('OpenRouter request aborted')
      }
      throw new Error(`OpenRouter connection failure: ${err?.message ?? String(err)}`)
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`OpenRouter error status ${response.status}: ${errText || response.statusText}`)
    }

    if (!response.body) {
      throw new Error('OpenRouter returned an empty stream body')
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
                  if (delta.content) {
                    chunk.content = delta.content
                    totalCharsStreamed += delta.content.length
                  }
                  if (delta.tool_calls) {
                    chunk.toolCalls = delta.tool_calls
                  }
                  if (choice.finish_reason) {
                    chunk.finishReason = choice.finish_reason
                    finishReason = choice.finish_reason
                  }
                  onChunk(chunk)
                }
              } catch (e) {
                // Ignore parse errors on stream block boundaries
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    const latencyMs = Date.now() - start
    const tokenUsageEstimate = Math.ceil(totalCharsStreamed / 4)

    return {
      finishReason,
      model: modelId,
      latencyMs,
      tokenUsageEstimate,
    }
  }

  async healthCheck(): Promise<{ available: boolean; error?: string }> {
    const apiKey = process.env.API_KEY || process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return { available: false, error: 'API_KEY is not configured in .env' }
    }
    try {
      const response = await fetch(`${this.baseUrl}/auth/key`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      })
      if (response.ok) {
        return { available: true }
      }
      return { available: false, error: `Auth check failed with status ${response.status}` }
    } catch (err: any) {
      return { available: false, error: `OpenRouter endpoint unreachable: ${err.message}` }
    }
  }
}
