import { AdvancedCognitiveMetrics } from './AdvancedCognitiveMetrics'
import type { CognitiveReflection, Engram, SimulationFrame } from './types'
import type { SemanticGraph } from './SemanticGraphEngine'

export interface CognitiveStateReport {
  activeEngrams: Array<{ id: string; score: number; content: string }>
  activeTraits: Array<{ id: string; content: string; confidence: number }>
  contradictionCount: number
  confidenceAverage: number
  reflectionSummaries: string[]
  graphComplexity: number
  driftMetrics: ReturnType<AdvancedCognitiveMetrics['score']>
  memoryStatistics: {
    total: number
    byKind: Record<string, number>
    reinforced: number
  }
}

export class CognitiveStateReporter {
  private metrics = new AdvancedCognitiveMetrics()

  report(input: {
    frames: SimulationFrame[]
    graph?: SemanticGraph
    reflections?: CognitiveReflection[]
  }): CognitiveStateReport {
    const latest = input.frames.at(-1)
    const engrams = latest?.engrams ?? []
    return {
      activeEngrams: (latest?.activated ?? []).map(item => ({
        id: item.engram.id,
        score: round(item.score),
        content: item.engram.content,
      })),
      activeTraits: engrams
        .filter(engram => (engram.memoryKind === 'behavioral' || engram.memoryKind === 'identity') && engram.confidence >= 0.55)
        .map(engram => ({ id: engram.id, content: engram.content, confidence: round(engram.confidence) })),
      contradictionCount: engrams.filter(engram => engram.contradictionScore > 0 || engram.conflictsWith.length > 0).length,
      confidenceAverage: round(average(engrams.map(engram => engram.confidence))),
      reflectionSummaries: (input.reflections ?? []).map(reflection => reflection.summary),
      graphComplexity: input.graph ? input.graph.nodes.length + input.graph.edges.length * 2 : 0,
      driftMetrics: this.metrics.score(input.frames),
      memoryStatistics: {
        total: engrams.length,
        byKind: byKind(engrams),
        reinforced: engrams.filter(engram => engram.reinforcementCount > 0).length,
      },
    }
  }
}

function byKind(engrams: Engram[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const engram of engrams) result[engram.memoryKind] = (result[engram.memoryKind] ?? 0) + 1
  return result
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
