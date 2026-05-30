import { SemanticGraphEngine } from './SemanticGraphEngine'
import type { Engram, SimulationFrame } from './types'

export interface AdvancedCognitiveMetricFrame {
  memoryEntropy: number
  behavioralDrift: number
  contradictionDensity: number
  recallPrecision: number
  recallRecall: number
  longTermStability: number
  associativeActivationQuality: number
}

export class AdvancedCognitiveMetrics {
  private graph = new SemanticGraphEngine()

  score(frames: SimulationFrame[], expectedKeywords: string[] = []): AdvancedCognitiveMetricFrame {
    const engrams = frames.at(-1)?.engrams ?? []
    return {
      memoryEntropy: round(memoryEntropy(engrams)),
      behavioralDrift: round(behavioralDrift(frames)),
      contradictionDensity: round(contradictionDensity(engrams)),
      recallPrecision: round(recallPrecision(frames, expectedKeywords)),
      recallRecall: round(recallRecall(engrams, expectedKeywords)),
      longTermStability: round(longTermStability(frames)),
      associativeActivationQuality: round(this.associativeActivationQuality(frames)),
    }
  }

  private associativeActivationQuality(frames: SimulationFrame[]): number {
    const last = frames.at(-1)
    if (!last || last.activated.length === 0) return 1
    const recalled = this.graph.associativeRecall(last.engrams, last.activated.map(item => item.engram.id), 1)
    if (recalled.length === 0) return 0
    const activeKinds = new Set(last.activated.map(item => item.engram.memoryKind))
    const related = recalled.filter(engram => activeKinds.has(engram.memoryKind))
    return related.length / recalled.length
  }
}

function memoryEntropy(engrams: Engram[]): number {
  if (engrams.length === 0) return 0
  const counts = new Map<string, number>()
  for (const engram of engrams) counts.set(engram.memoryKind, (counts.get(engram.memoryKind) ?? 0) + 1)
  let entropy = 0
  for (const count of counts.values()) {
    const p = count / engrams.length
    entropy -= p * Math.log2(p)
  }
  const max = Math.log2(Math.max(2, counts.size))
  return entropy / max
}

function behavioralDrift(frames: SimulationFrame[]): number {
  if (frames.length < 2) return 0
  const first = frames[0].behavior
  const last = frames[frames.length - 1].behavior
  return Math.min(1, (
    Math.abs(last.verbosity - first.verbosity) +
    Math.abs(last.specificity - first.specificity) +
    Math.abs(last.initiativeLevel - first.initiativeLevel) +
    Math.abs(last.repetitionPenalty - first.repetitionPenalty)
  ) / 4)
}

function contradictionDensity(engrams: Engram[]): number {
  if (engrams.length === 0) return 0
  return engrams.filter(engram => engram.contradictionScore > 0 || engram.conflictsWith.length > 0).length / engrams.length
}

function recallPrecision(frames: SimulationFrame[], expectedKeywords: string[]): number {
  const activated = frames.flatMap(frame => frame.activated.map(item => item.engram.content.toLowerCase()))
  if (activated.length === 0) return expectedKeywords.length === 0 ? 1 : 0
  if (expectedKeywords.length === 0) return 1
  const relevant = activated.filter(content => expectedKeywords.some(keyword => content.includes(keyword.toLowerCase())))
  return relevant.length / activated.length
}

function recallRecall(engrams: Engram[], expectedKeywords: string[]): number {
  if (expectedKeywords.length === 0) return 1
  const content = engrams.map(engram => engram.content.toLowerCase()).join(' ')
  return expectedKeywords.filter(keyword => content.includes(keyword.toLowerCase())).length / expectedKeywords.length
}

function longTermStability(frames: SimulationFrame[]): number {
  if (frames.length < 2) return 1
  const first = averageConfidence(frames[0].engrams)
  const last = averageConfidence(frames[frames.length - 1].engrams)
  return Math.max(0, 1 - Math.abs(last - first))
}

function averageConfidence(engrams: Engram[]): number {
  if (engrams.length === 0) return 0
  return engrams.reduce((sum, engram) => sum + engram.confidence, 0) / engrams.length
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
