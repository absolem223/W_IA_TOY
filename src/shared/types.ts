// Shared types used across main, preload, and renderer.
// Kept in /shared to avoid cross-process import issues.

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  metadata?: {
    cognitiveState?: string
    references?: Array<{
      id: string
      title: string
      url: string
      source: string
      confidence: number
      type: 'concept' | 'multimedia' | 'document' | 'memory'
    }>
    sessionType?: string
    /** True when this user message was sourced from a voice transcription */
    fromVoice?: boolean
    modelInfo?: {
      provider: string
      model: string
      timestamp: number
      fallbackReason?: string
    }
  }
}
