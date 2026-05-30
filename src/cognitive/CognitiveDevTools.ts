import { CognitiveInspector } from './CognitiveInspector'
import type { CognitiveReflection, CognitiveSnapshot, SimulationFrame } from './types'
import type { SemanticGraph } from './SemanticGraphEngine'

export interface CognitiveTimelineItem {
  frameId: string
  timestamp: string
  activeEngramIds: string[]
  eventTypes: string[]
}

export interface SnapshotDiff {
  from: string
  to: string
  addedEngrams: string[]
  removedEngrams: string[]
  confidenceChanges: Array<{ id: string; from: number; to: number; delta: number }>
}

export class CognitiveDevTools {
  private inspector = new CognitiveInspector()

  timeline(frames: SimulationFrame[]): CognitiveTimelineItem[] {
    return frames.map(frame => ({
      frameId: frame.frameId ?? 'unknown',
      timestamp: (frame.turn.timestamp ?? new Date()).toISOString(),
      activeEngramIds: frame.activated.map(item => item.engram.id),
      eventTypes: frame.events.map(event => event.type),
    }))
  }

  activationExplorer(frame: SimulationFrame): ReturnType<CognitiveInspector['inspectFrame']> {
    return this.inspector.inspectFrame(frame)
  }

  graphVisualizationData(graph: SemanticGraph): SemanticGraph {
    return {
      nodes: graph.nodes,
      edges: graph.edges,
    }
  }

  reflectionViewer(reflections: CognitiveReflection[]): Array<{ id: string; summary: string; hypotheses: number; insights: number }> {
    return reflections.map(reflection => ({
      id: reflection.id,
      summary: reflection.summary,
      hypotheses: reflection.recurrentPatterns.length,
      insights: reflection.longitudinalInsights.length,
    }))
  }

  traitEvolution(snapshots: CognitiveSnapshot[]): Array<{ frameId: string; behavioralConfidence: number }> {
    return snapshots.map(snapshot => {
      const behavioral = snapshot.engrams.filter(engram => engram.memoryKind === 'behavioral')
      const confidence = behavioral.length === 0 ? 0 : behavioral.reduce((sum, engram) => sum + engram.confidence, 0) / behavioral.length
      return { frameId: snapshot.frameId, behavioralConfidence: round(confidence) }
    })
  }

  contradictionInspector(snapshot: CognitiveSnapshot): Array<{ id: string; contradictionScore: number; conflictsWith: string[] }> {
    return snapshot.engrams
      .filter(engram => engram.contradictionScore > 0 || engram.conflictsWith.length > 0)
      .map(engram => ({ id: engram.id, contradictionScore: engram.contradictionScore, conflictsWith: engram.conflictsWith }))
  }

  reinforcementHeatmap(snapshots: CognitiveSnapshot[]): Record<string, number[]> {
    const heatmap: Record<string, number[]> = {}
    for (const snapshot of snapshots) {
      for (const engram of snapshot.engrams) {
        heatmap[engram.id] = heatmap[engram.id] ?? []
        heatmap[engram.id].push(engram.reinforcementCount)
      }
    }
    return heatmap
  }

  diffSnapshots(a: CognitiveSnapshot, b: CognitiveSnapshot): SnapshotDiff {
    const left = new Map(a.engrams.map(engram => [engram.id, engram]))
    const right = new Map(b.engrams.map(engram => [engram.id, engram]))
    const addedEngrams = [...right.keys()].filter(id => !left.has(id))
    const removedEngrams = [...left.keys()].filter(id => !right.has(id))
    const confidenceChanges = [...right.entries()]
      .filter(([id, engram]) => left.has(id) && Math.abs((left.get(id)?.confidence ?? 0) - engram.confidence) > 0.001)
      .map(([id, engram]) => {
        const previous = left.get(id)?.confidence ?? 0
        return { id, from: round(previous), to: round(engram.confidence), delta: round(engram.confidence - previous) }
      })
    return { from: a.frameId, to: b.frameId, addedEngrams, removedEngrams, confidenceChanges }
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
