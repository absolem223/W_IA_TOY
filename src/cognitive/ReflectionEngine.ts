import type { CognitiveEventBus } from './CognitiveEventBus'
import type { CognitiveReflection, Engram, ReflectionHypothesis, SimulationFrame } from './types'

export class ReflectionEngine {
  reflect(frames: SimulationFrame[], timestamp = new Date(), events?: CognitiveEventBus): CognitiveReflection {
    const engrams = latestEngrams(frames)
    const recurrentPatterns = this.detectRecurrentPatterns(engrams)
    const behavioralChanges = this.detectBehavioralChanges(frames)
    const longitudinalInsights = this.detectLongitudinalInsights(frames, engrams)
    const reflection: CognitiveReflection = {
      id: `reflection_${timestamp.getTime()}`,
      timestamp: timestamp.toISOString(),
      summary: `Observed ${frames.length} frames, ${engrams.length} engrams, ${recurrentPatterns.length} recurrent patterns.`,
      recurrentPatterns,
      behavioralChanges,
      longitudinalInsights,
    }
    events?.emit('reflection.generated', { reflection }, timestamp)
    return reflection
  }

  private detectRecurrentPatterns(engrams: Engram[]): ReflectionHypothesis[] {
    const byKind = new Map<string, Engram[]>()
    for (const engram of engrams) {
      const bucket = byKind.get(engram.memoryKind) ?? []
      bucket.push(engram)
      byKind.set(engram.memoryKind, bucket)
    }

    const hypotheses: ReflectionHypothesis[] = []
    for (const [kind, items] of byKind) {
      const reinforced = items.filter(item => item.reinforcementCount >= 1 || item.confidence >= 0.75)
      if (reinforced.length < 2) continue
      const confidence = reinforced.reduce((sum, item) => sum + item.confidence, 0) / reinforced.length
      hypotheses.push({
        id: `hyp_${kind}_${reinforced.length}`,
        label: `${kind}_pattern`,
        confidence: round(confidence),
        evidenceEngramIds: reinforced.map(item => item.id),
        summary: `Multiple ${kind} engrams show stable or reinforced memory traces.`,
      })
    }
    return hypotheses
  }

  private detectBehavioralChanges(frames: SimulationFrame[]): string[] {
    if (frames.length < 2) return []
    const first = frames[0].behavior
    const last = frames[frames.length - 1].behavior
    const changes: string[] = []
    if (Math.abs(last.specificity - first.specificity) > 0.1) changes.push(`specificity ${formatDelta(last.specificity - first.specificity)}`)
    if (Math.abs(last.verbosity - first.verbosity) > 0.1) changes.push(`verbosity ${formatDelta(last.verbosity - first.verbosity)}`)
    if (Math.abs(last.initiativeLevel - first.initiativeLevel) > 0.1) changes.push(`initiative ${formatDelta(last.initiativeLevel - first.initiativeLevel)}`)
    if (first.tone !== last.tone) changes.push(`tone shifted from ${first.tone} to ${last.tone}`)
    return changes
  }

  private detectLongitudinalInsights(frames: SimulationFrame[], engrams: Engram[]): string[] {
    const insights: string[] = []
    const activations = frames.flatMap(frame => frame.activated)
    const repeatedActivations = new Map<string, number>()
    for (const activation of activations) {
      repeatedActivations.set(activation.engram.id, (repeatedActivations.get(activation.engram.id) ?? 0) + 1)
    }
    for (const [id, count] of repeatedActivations) {
      if (count >= 3) insights.push(`Engram ${id} repeatedly activates across time (${count} activations).`)
    }
    const contradicted = engrams.filter(engram => engram.contradictionScore > 0.25)
    if (contradicted.length > 0) insights.push(`${contradicted.length} engrams show contradiction pressure.`)
    return insights
  }
}

function latestEngrams(frames: SimulationFrame[]): Engram[] {
  return frames.at(-1)?.engrams ?? []
}

function formatDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${round(value)}`
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
