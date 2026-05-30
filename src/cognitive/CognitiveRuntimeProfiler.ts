import type { SemanticGraph } from './SemanticGraphEngine'
import type { SimulationFrame } from './types'

export interface RuntimeProfile {
  frames: number
  engramCount: number
  estimatedMemoryBytes: number
  graphComplexity: number
  activationCost: number
  consolidationCost: number
  replayCost: number
  measuredMs: number
}

export class CognitiveRuntimeProfiler {
  profile(input: { frames: SimulationFrame[]; graph?: SemanticGraph; startedAt?: number; endedAt?: number }): RuntimeProfile {
    const latest = input.frames.at(-1)
    const engramCount = latest?.engrams.length ?? 0
    const graphComplexity = input.graph ? input.graph.nodes.length + input.graph.edges.length * 2 : 0
    const activationCount = input.frames.reduce((sum, frame) => sum + frame.activated.length, 0)
    return {
      frames: input.frames.length,
      engramCount,
      estimatedMemoryBytes: estimateBytes(input.frames),
      graphComplexity,
      activationCost: round(activationCount / Math.max(1, input.frames.length)),
      consolidationCost: round(engramCount * Math.log2(Math.max(2, engramCount))),
      replayCost: round(input.frames.length * Math.max(1, engramCount) / 100),
      measuredMs: input.startedAt !== undefined && input.endedAt !== undefined ? round(input.endedAt - input.startedAt) : 0,
    }
  }
}

function estimateBytes(value: unknown): number {
  return JSON.stringify(value).length * 2
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
