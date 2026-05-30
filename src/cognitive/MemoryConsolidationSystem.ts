import { cosineSimilarity, embedText, tokenize } from './embedding'
import { EngramStore } from './EngramStore'
import type { CognitiveEventBus } from './CognitiveEventBus'
import type { BehavioralEffect, Engram } from './types'

export interface ConsolidationResult {
  clusters: Engram[][]
  createdTraits: Engram[]
  compressedCount: number
}

export class MemoryConsolidationSystem {
  consolidate(store: EngramStore, events?: CognitiveEventBus, timestamp = new Date()): ConsolidationResult {
    const engrams = store.all()
    const clusters = this.clusterSimilar(engrams)
    const createdTraits: Engram[] = []
    let compressedCount = 0

    for (const cluster of clusters) {
      if (cluster.length < 2) continue
      const confidence = average(cluster.map(item => item.confidence))
      const effects = unique(cluster.flatMap(item => item.behavioralEffects))
      const trait = store.create({
        type: cluster.some(item => item.type === 'behavioral_pattern') ? 'behavioral_pattern' : 'semantic_fact',
        memoryKind: cluster[0].memoryKind,
        content: compressContent(cluster),
        confidence: Math.min(0.95, confidence + 0.08),
        emotionalWeight: average(cluster.map(item => item.emotionalWeight)),
        decayRate: Math.min(...cluster.map(item => item.decayRate)),
        behavioralEffects: effects,
        createdAt: timestamp,
      })
      createdTraits.push(trait)
      compressedCount += cluster.length
      events?.emit('engram.consolidated', {
        trait,
        sourceEngramIds: cluster.map(item => item.id),
      }, timestamp)
    }

    return { clusters, createdTraits, compressedCount }
  }

  clusterSimilar(engrams: Engram[], threshold = 0.72): Engram[][] {
    const clusters: Engram[][] = []
    const used = new Set<string>()

    for (const engram of engrams) {
      if (used.has(engram.id)) continue
      const cluster = [engram]
      used.add(engram.id)
      for (const other of engrams) {
        if (used.has(other.id) || other.id === engram.id) continue
        if (other.memoryKind !== engram.memoryKind) continue
        const similarity = cosineSimilarity(engram.semanticEmbedding, other.semanticEmbedding)
        if (similarity >= threshold) {
          cluster.push(other)
          used.add(other.id)
        }
      }
      clusters.push(cluster)
    }

    return clusters
  }
}

function compressContent(cluster: Engram[]): string {
  const tokens = cluster.flatMap(item => tokenize(item.content))
  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  const keywords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token)
    .join(', ')
  return `Consolidated trait from ${cluster.length} related memories: ${keywords || cluster[0].content}`
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
