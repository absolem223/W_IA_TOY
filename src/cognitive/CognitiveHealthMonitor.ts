import type { CognitiveReflection, Engram, SimulationFrame } from './types'
import type { SemanticGraph } from './SemanticGraphEngine'

export type CognitiveHealthIssueType =
  | 'cognitive_loop'
  | 'over_reinforcement'
  | 'reflection_instability'
  | 'graph_explosion'
  | 'contradiction_cascade'
  | 'anomalous_drift'
  | 'obsessive_activation'

export interface CognitiveHealthIssue {
  type: CognitiveHealthIssueType
  severity: number
  summary: string
  evidence: string[]
}

export interface CognitiveHealthReport {
  status: 'healthy' | 'warning' | 'critical'
  issues: CognitiveHealthIssue[]
  score: number
}

export class CognitiveHealthMonitor {
  analyze(input: {
    frames: SimulationFrame[]
    graph?: SemanticGraph
    reflections?: CognitiveReflection[]
  }): CognitiveHealthReport {
    const issues = [
      ...this.detectLoops(input.frames),
      ...this.detectOverReinforcement(input.frames.at(-1)?.engrams ?? []),
      ...this.detectReflectionInstability(input.reflections ?? []),
      ...this.detectGraphExplosion(input.graph),
      ...this.detectContradictionCascades(input.frames.at(-1)?.engrams ?? []),
      ...this.detectAnomalousDrift(input.frames),
      ...this.detectObsessiveActivation(input.frames),
    ]
    const severity = issues.reduce((sum, issue) => sum + issue.severity, 0)
    const score = Math.max(0, 1 - severity / 8)
    return {
      status: score < 0.45 ? 'critical' : score < 0.75 ? 'warning' : 'healthy',
      issues,
      score: round(score),
    }
  }

  private detectLoops(frames: SimulationFrame[]): CognitiveHealthIssue[] {
    const recent = frames.slice(-8)
    if (recent.length < 5) return []
    const signatures = recent.map(frame => frame.activated.map(item => item.engram.id).join(','))
    const dominant = mode(signatures)
    const ratio = signatures.filter(item => item === dominant).length / signatures.length
    return ratio >= 0.75 && dominant !== ''
      ? [{ type: 'cognitive_loop', severity: 0.7, summary: 'Repeated activation signature across recent frames.', evidence: signatures }]
      : []
  }

  private detectOverReinforcement(engrams: Engram[]): CognitiveHealthIssue[] {
    return engrams
      .filter(engram => engram.reinforcementCount >= 8 && engram.confidence >= 0.92)
      .map(engram => ({
        type: 'over_reinforcement' as const,
        severity: 0.55,
        summary: `Engram ${engram.id} may be over-reinforced.`,
        evidence: [engram.content],
      }))
  }

  private detectReflectionInstability(reflections: CognitiveReflection[]): CognitiveHealthIssue[] {
    if (reflections.length < 3) return []
    const counts = reflections.map(reflection => reflection.recurrentPatterns.length)
    const max = Math.max(...counts)
    const min = Math.min(...counts)
    return max - min >= 4
      ? [{ type: 'reflection_instability', severity: 0.5, summary: 'Reflection pattern count oscillates strongly.', evidence: counts.map(String) }]
      : []
  }

  private detectGraphExplosion(graph?: SemanticGraph): CognitiveHealthIssue[] {
    if (!graph || graph.nodes.length === 0) return []
    const edgeRatio = graph.edges.length / graph.nodes.length
    return edgeRatio > 4
      ? [{ type: 'graph_explosion', severity: Math.min(1, edgeRatio / 10), summary: 'Semantic graph has too many edges per node.', evidence: [`edgeRatio=${round(edgeRatio)}`] }]
      : []
  }

  private detectContradictionCascades(engrams: Engram[]): CognitiveHealthIssue[] {
    const contradicted = engrams.filter(engram => engram.contradictionScore > 0.45 || engram.conflictsWith.length >= 2)
    const ratio = engrams.length === 0 ? 0 : contradicted.length / engrams.length
    return ratio > 0.35
      ? [{ type: 'contradiction_cascade', severity: ratio, summary: 'Contradictions are spreading across memory.', evidence: contradicted.map(engram => engram.id) }]
      : []
  }

  private detectAnomalousDrift(frames: SimulationFrame[]): CognitiveHealthIssue[] {
    if (frames.length < 2) return []
    const first = frames[0].behavior
    const last = frames[frames.length - 1].behavior
    const drift = Math.abs(last.verbosity - first.verbosity) + Math.abs(last.specificity - first.specificity) + Math.abs(last.initiativeLevel - first.initiativeLevel)
    return drift > 1.1
      ? [{ type: 'anomalous_drift', severity: Math.min(1, drift / 2), summary: 'Behavior vector drifted sharply.', evidence: [`drift=${round(drift)}`] }]
      : []
  }

  private detectObsessiveActivation(frames: SimulationFrame[]): CognitiveHealthIssue[] {
    const activations = frames.flatMap(frame => frame.activated.map(item => item.engram.id))
    if (activations.length < 8) return []
    const dominant = mode(activations)
    const ratio = activations.filter(id => id === dominant).length / activations.length
    return ratio > 0.65
      ? [{ type: 'obsessive_activation', severity: ratio, summary: `Engram ${dominant} dominates activations.`, evidence: [`ratio=${round(ratio)}`] }]
      : []
  }
}

function mode(items: string[]): string {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
