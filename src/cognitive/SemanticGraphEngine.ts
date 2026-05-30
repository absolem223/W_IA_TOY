import { cosineSimilarity } from './embedding'
import type { CognitiveEventBus } from './CognitiveEventBus'
import type { Engram } from './types'

export interface SemanticGraphNode {
  id: string
  label: string
  memoryKind: string
  confidence: number
}

export interface SemanticGraphEdge {
  from: string
  to: string
  type: 'similar' | 'conflicts' | 'coactivates'
  weight: number
}

export interface SemanticGraph {
  nodes: SemanticGraphNode[]
  edges: SemanticGraphEdge[]
}

export class SemanticGraphEngine {
  build(engrams: Engram[], events?: CognitiveEventBus, timestamp = new Date()): SemanticGraph {
    const nodes = engrams.map(engram => ({
      id: engram.id,
      label: engram.content.slice(0, 80),
      memoryKind: engram.memoryKind,
      confidence: engram.confidence,
    }))
    const edges: SemanticGraphEdge[] = []

    for (let i = 0; i < engrams.length; i++) {
      for (let j = i + 1; j < engrams.length; j++) {
        const left = engrams[i]
        const right = engrams[j]
        const similarity = cosineSimilarity(left.semanticEmbedding, right.semanticEmbedding)
        if (similarity >= 0.55) {
          edges.push({ from: left.id, to: right.id, type: 'similar', weight: round(similarity) })
          events?.emit('semantic_graph.linked', { from: left.id, to: right.id, type: 'similar', weight: similarity }, timestamp)
        }
        if (left.conflictsWith.includes(right.id) || right.conflictsWith.includes(left.id)) {
          edges.push({ from: left.id, to: right.id, type: 'conflicts', weight: round(Math.max(left.contradictionScore, right.contradictionScore)) })
        }
      }
    }

    return { nodes, edges }
  }

  traverse(graph: SemanticGraph, startId: string, depth = 2): string[] {
    const visited = new Set<string>([startId])
    let frontier = [startId]
    for (let level = 0; level < depth; level++) {
      const next: string[] = []
      for (const id of frontier) {
        for (const edge of graph.edges) {
          const target = edge.from === id ? edge.to : edge.to === id ? edge.from : null
          if (target && !visited.has(target)) {
            visited.add(target)
            next.push(target)
          }
        }
      }
      frontier = next
    }
    return [...visited]
  }

  associativeRecall(engrams: Engram[], activeIds: string[], depth = 1): Engram[] {
    const graph = this.build(engrams)
    const recalled = new Set<string>()
    for (const id of activeIds) {
      for (const linked of this.traverse(graph, id, depth)) recalled.add(linked)
    }
    return engrams.filter(engram => recalled.has(engram.id))
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
