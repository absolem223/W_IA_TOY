import type { ChatMessage } from '../../../../shared/types'
import type { InferenceProvider, ProviderCapabilities, ChatCompletionChunk } from '../types'

export class LocalFallbackProvider implements InferenceProvider {
  readonly id = 'fallback'
  readonly name = 'Local Offline Fallback'
  readonly type = 'local'

  async initialize(): Promise<void> {
    // No-op
  }

  getCapabilities(modelId: string): ProviderCapabilities {
    return {
      tools: false,
      streaming: true,
      vision: false,
      jsonMode: false,
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
    const fallbackText = 'Estoy en modo reducido ahora mismo. Mi memoria e identidad siguen presentes, pero necesito que una herramienta cognitiva vuelva a estar disponible para responder con profundidad.'

    const chunkSize = 15
    for (let i = 0; i < fallbackText.length; i += chunkSize) {
      if (options.signal?.aborted) {
        throw new Error('Fallback completion request aborted')
      }
      onChunk({
        content: fallbackText.slice(i, i + chunkSize),
      })
      // Simulate small streaming delay
      await new Promise(resolve => setTimeout(resolve, 30))
    }

    onChunk({ finishReason: 'stop' })

    return {
      finishReason: 'stop',
      model: 'local-offline-fallback',
      latencyMs: Date.now() - start,
      tokenUsageEstimate: Math.ceil(fallbackText.length / 4),
    }
  }

  async healthCheck(): Promise<{ available: boolean }> {
    return { available: true }
  }
}
