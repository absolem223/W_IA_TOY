import type { ActivationScore, ActivationTrace, CognitiveSnapshot, Engram, SimulationFrame } from './types'

export interface EngramInspection {
  id: string
  type: string
  memoryKind: string
  content: string
  confidence: number
  emotionalWeight: number
  reinforcementCount: number
  negativeReinforcementCount: number
  decayRate: number
  contradictionScore: number
  conflictsWith: string[]
  createdAt: string
  updatedAt: string
  lastActivatedAt: string | null
}

export interface CognitiveInspection {
  activeEngrams: Array<{
    id: string
    score: number
    reasons: ActivationScore['reasons']
    effects: string[]
  }>
  engrams: EngramInspection[]
  conflicts: Array<{ engramId: string; conflictsWith: string[]; contradictionScore: number }>
  activationTrace: ActivationTrace | null
  timestamps: {
    inspectedAt: string
    latestEngramUpdate: string | null
  }
}

export class CognitiveInspector {
  inspectFrame(frame: SimulationFrame): CognitiveInspection {
    return this.inspect({
      engrams: frame.engrams,
      activated: frame.activated,
      trace: frame.trace ?? null,
      inspectedAt: frame.turn.timestamp ?? new Date(),
    })
  }

  inspectSnapshot(snapshot: CognitiveSnapshot): CognitiveInspection {
    const active = new Set(snapshot.activeEngramIds)
    return this.inspect({
      engrams: snapshot.engrams,
      activated: snapshot.engrams
        .filter(engram => active.has(engram.id))
        .map(engram => ({
          engram,
          score: 1,
          reasons: {
            semanticSimilarity: 1,
            confidence: engram.confidence,
            emotionalBoost: 0.8 + engram.emotionalWeight * 0.2,
            recencyMultiplier: 1,
          },
        })),
      trace: null,
      inspectedAt: new Date(snapshot.timestamp),
    })
  }

  private inspect(input: {
    engrams: Engram[]
    activated: ActivationScore[]
    trace: ActivationTrace | null
    inspectedAt: Date
  }): CognitiveInspection {
    const latest = input.engrams
      .map(engram => engram.updatedAt)
      .sort()
      .at(-1) ?? null

    return {
      activeEngrams: input.activated.map(item => ({
        id: item.engram.id,
        score: round(item.score),
        reasons: item.reasons,
        effects: item.engram.behavioralEffects,
      })),
      engrams: input.engrams.map(toInspection),
      conflicts: input.engrams
        .filter(engram => engram.conflictsWith.length > 0 || engram.contradictionScore > 0)
        .map(engram => ({
          engramId: engram.id,
          conflictsWith: engram.conflictsWith,
          contradictionScore: round(engram.contradictionScore),
        })),
      activationTrace: input.trace,
      timestamps: {
        inspectedAt: input.inspectedAt.toISOString(),
        latestEngramUpdate: latest,
      },
    }
  }
}

function toInspection(engram: Engram): EngramInspection {
  return {
    id: engram.id,
    type: engram.type,
    memoryKind: engram.memoryKind,
    content: engram.content,
    confidence: round(engram.confidence),
    emotionalWeight: round(engram.emotionalWeight),
    reinforcementCount: engram.reinforcementCount,
    negativeReinforcementCount: engram.negativeReinforcementCount,
    decayRate: round(engram.decayRate),
    contradictionScore: round(engram.contradictionScore),
    conflictsWith: [...engram.conflictsWith],
    createdAt: engram.createdAt,
    updatedAt: engram.updatedAt,
    lastActivatedAt: engram.lastActivatedAt,
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
