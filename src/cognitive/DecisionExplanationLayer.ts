import type { CognitiveReflection, SimulationFrame } from './types'

export interface DecisionExplanation {
  frameId: string
  participatingSystems: string[]
  activatedMemories: Array<{ id: string; content: string; score: number; confidence: number }>
  policyInfluence: string[]
  reflectionInfluence: string[]
  confidenceByInference: Array<{ id: string; confidence: number; contradictionScore: number }>
  behaviorEffects: string[]
}

export class DecisionExplanationLayer {
  explain(input: {
    frame: SimulationFrame
    policies?: string[]
    reflections?: CognitiveReflection[]
  }): DecisionExplanation {
    const activeEffects = input.frame.activated.flatMap(item => item.engram.behavioralEffects)
    return {
      frameId: input.frame.frameId ?? 'unknown',
      participatingSystems: [
        'EngramStore',
        'ContextActivationEngine',
        'BehavioralAdaptationEngine',
        ...(input.frame.feedback.length > 0 ? ['ReinforcementEngine'] : []),
      ],
      activatedMemories: input.frame.activated.map(item => ({
        id: item.engram.id,
        content: item.engram.content,
        score: round(item.score),
        confidence: round(item.engram.confidence),
      })),
      policyInfluence: input.policies ?? [],
      reflectionInfluence: (input.reflections ?? []).flatMap(reflection => [
        reflection.summary,
        ...reflection.longitudinalInsights,
      ]),
      confidenceByInference: input.frame.activated.map(item => ({
        id: item.engram.id,
        confidence: round(item.engram.confidence),
        contradictionScore: round(item.engram.contradictionScore),
      })),
      behaviorEffects: [...new Set(activeEffects)],
    }
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
