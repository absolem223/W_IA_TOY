import type { CognitiveSnapshot, SimulationFrame } from './types'

export interface EmergentPattern {
  type:
    | 'emergent_pattern'
    | 'cognitive_anomaly'
    | 'unexpected_drift'
    | 'unstable_trait'
    | 'false_personality_formation'
  severity: number
  summary: string
  evidence: string[]
}

export class EmergentBehaviorAnalysis {
  analyze(frames: SimulationFrame[], snapshots: CognitiveSnapshot[]): EmergentPattern[] {
    return [
      ...this.detectEmergentPatterns(frames),
      ...this.detectUnexpectedDrift(frames),
      ...this.detectUnstableTraits(snapshots),
      ...this.detectFalsePersonalityFormation(snapshots),
    ]
  }

  private detectEmergentPatterns(frames: SimulationFrame[]): EmergentPattern[] {
    const repeated = new Map<string, number>()
    for (const frame of frames) {
      for (const activation of frame.activated) {
        repeated.set(activation.engram.id, (repeated.get(activation.engram.id) ?? 0) + 1)
      }
    }
    return [...repeated.entries()]
      .filter(([, count]) => count >= 4)
      .map(([id, count]) => ({
        type: 'emergent_pattern' as const,
        severity: Math.min(1, count / Math.max(1, frames.length)),
        summary: `Engram ${id} became a recurring activation pattern.`,
        evidence: [`activations=${count}`],
      }))
  }

  private detectUnexpectedDrift(frames: SimulationFrame[]): EmergentPattern[] {
    if (frames.length < 3) return []
    const start = frames[0].behavior.specificity
    const end = frames[frames.length - 1].behavior.specificity
    const drift = Math.abs(end - start)
    return drift > 0.45
      ? [{ type: 'unexpected_drift', severity: drift, summary: 'Specificity drift exceeded expected bounds.', evidence: [`drift=${round(drift)}`] }]
      : []
  }

  private detectUnstableTraits(snapshots: CognitiveSnapshot[]): EmergentPattern[] {
    const byEngram = new Map<string, number[]>()
    for (const snapshot of snapshots) {
      for (const engram of snapshot.engrams.filter(item => item.memoryKind === 'behavioral' || item.memoryKind === 'identity')) {
        byEngram.set(engram.id, [...(byEngram.get(engram.id) ?? []), engram.confidence])
      }
    }
    const patterns: EmergentPattern[] = []
    for (const [id, values] of byEngram) {
      if (values.length < 3) continue
      const swing = Math.max(...values) - Math.min(...values)
      if (swing > 0.35) {
        patterns.push({ type: 'unstable_trait', severity: swing, summary: `Trait ${id} confidence is unstable.`, evidence: values.map(round).map(String) })
      }
    }
    return patterns
  }

  private detectFalsePersonalityFormation(snapshots: CognitiveSnapshot[]): EmergentPattern[] {
    const latest = snapshots.at(-1)
    if (!latest) return []
    return latest.engrams
      .filter(engram => engram.memoryKind === 'identity' && engram.reinforcementCount === 0 && engram.confidence > 0.8)
      .map(engram => ({
        type: 'false_personality_formation' as const,
        severity: engram.confidence,
        summary: `Identity engram ${engram.id} is strong without reinforcement.`,
        evidence: [engram.content],
      }))
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
