import type { ActivationScore, BehaviorState, Engram } from './types'
import type { CognitiveEventBus } from './CognitiveEventBus'

export interface ShadowLLMContext {
  activeEngrams: Array<{ id: string; content: string; score: number }>
  identitySummaries: string[]
  behavioralHints: BehaviorState
  emotionalContext: Array<{ id: string; content: string; confidence: number }>
}

export class ShadowLLMAdapter {
  buildContext(input: {
    activated: ActivationScore[]
    engrams: Engram[]
    behavior: BehaviorState
    events?: CognitiveEventBus
    timestamp?: Date
  }): ShadowLLMContext {
    const context: ShadowLLMContext = {
      activeEngrams: input.activated.map(item => ({
        id: item.engram.id,
        content: item.engram.content,
        score: Math.round(item.score * 1000) / 1000,
      })),
      identitySummaries: input.engrams
        .filter(engram => engram.memoryKind === 'identity')
        .map(engram => engram.content),
      behavioralHints: input.behavior,
      emotionalContext: input.engrams
        .filter(engram => engram.memoryKind === 'emotional' && engram.confidence >= 0.25)
        .map(engram => ({ id: engram.id, content: engram.content, confidence: engram.confidence })),
    }
    input.events?.emit('shadow_llm.context_built', { context }, input.timestamp ?? new Date())
    return context
  }
}
