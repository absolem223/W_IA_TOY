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
  }
}
