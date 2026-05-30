import type { ChatMessage } from '../../../shared/types'

export interface ProviderCapabilities {
  tools: boolean
  streaming: boolean
  vision: boolean
  jsonMode: boolean
  longContext: boolean
}

export interface ChatCompletionChunk {
  content?: string
  /** Internal chain-of-thought from thinking models (Qwen3, DeepSeek R1, etc.).
   *  Not emitted to the user-facing chat response. */
  reasoningContent?: string
  toolCalls?: Array<{
    index: number
    id?: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  finishReason?: string | null
}

export interface InferenceProvider {
  readonly id: string
  readonly name: string
  readonly type: 'local' | 'cloud'

  initialize(): Promise<void>
  getCapabilities(modelId: string): ProviderCapabilities
  streamCompletion(
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
  ): Promise<{ finishReason: string; model: string; latencyMs: number; tokenUsageEstimate: number }>
  healthCheck(): Promise<{ available: boolean; error?: string }>
}

export interface LLMSettings {
  providerId: string
  modelId: string
  allowAutomaticFallback: boolean
  recoveryExpiryMs: number
}

export interface LLMStatus {
  providerId: string
  modelId: string
  allowAutomaticFallback: boolean
  availableProviders: Array<{ id: string; name: string; type: 'local' | 'cloud' }>
  activeCapabilities: ProviderCapabilities
}

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  providerId: 'lmstudio',
  // This default is used only if llm-config.json doesn't exist yet.
  // At runtime LMStudioProvider.resolveModel() will auto-correct to whatever model
  // is actually loaded in LM Studio, so this value is just a starting suggestion.
  modelId: 'llama-3.2-3b-instruct',
  allowAutomaticFallback: false,
  recoveryExpiryMs: 45 * 60 * 1000, // 45 minutes
}
