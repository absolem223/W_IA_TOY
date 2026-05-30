import { cosineSimilarity, embedText } from './embedding'
import type { Engram } from './types'

export interface EmbeddingProvider {
  readonly id: string
  embed(text: string): number[]
}

export interface SimilarityProvider {
  readonly id: string
  similarity(a: number[], b: number[]): number
}

export interface SemanticScoringBackend {
  readonly id: string
  score(query: string, engram: Engram): number
}

export interface ClusteringProvider {
  readonly id: string
  cluster(engrams: Engram[], threshold?: number): Engram[][]
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'hash-embedding-v1'

  embed(text: string): number[] {
    return embedText(text)
  }
}

export class CosineSimilarityProvider implements SimilarityProvider {
  readonly id = 'cosine-similarity-v1'

  similarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b)
  }
}

export class DefaultSemanticScoringBackend implements SemanticScoringBackend {
  readonly id = 'default-semantic-scoring-v1'

  constructor(
    private embeddings: EmbeddingProvider = new HashEmbeddingProvider(),
    private similarityProvider: SimilarityProvider = new CosineSimilarityProvider(),
  ) {}

  score(query: string, engram: Engram): number {
    return this.similarityProvider.similarity(this.embeddings.embed(query), engram.semanticEmbedding)
  }
}

export class SimilarityClusteringProvider implements ClusteringProvider {
  readonly id = 'similarity-clustering-v1'

  constructor(private similarityProvider: SimilarityProvider = new CosineSimilarityProvider()) {}

  cluster(engrams: Engram[], threshold = 0.72): Engram[][] {
    const clusters: Engram[][] = []
    const used = new Set<string>()
    for (const engram of engrams) {
      if (used.has(engram.id)) continue
      const cluster = [engram]
      used.add(engram.id)
      for (const other of engrams) {
        if (used.has(other.id) || other.memoryKind !== engram.memoryKind) continue
        if (this.similarityProvider.similarity(engram.semanticEmbedding, other.semanticEmbedding) >= threshold) {
          cluster.push(other)
          used.add(other.id)
        }
      }
      clusters.push(cluster)
    }
    return clusters
  }
}
