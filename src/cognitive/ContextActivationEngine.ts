import { cosineSimilarity, embedText, keywordOverlap } from './embedding'
import type { ActivationQuery, ActivationScore, Engram } from './types'

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export class ContextActivationEngine {
  activate(engrams: Engram[], query: ActivationQuery): ActivationScore[] {
    const now = query.timestamp ?? new Date()
    const queryEmbedding = embedText(query.text)
    const scored = engrams.map(engram => {
      const vectorSimilarity = cosineSimilarity(queryEmbedding, engram.semanticEmbedding)
      const lexicalSimilarity = keywordOverlap(query.text, engram.content)
      const semanticSimilarity = Math.max(vectorSimilarity, lexicalSimilarity)
      const ageDays = (now.getTime() - new Date(engram.updatedAt).getTime()) / 86_400_000
      const recencyMultiplier = clamp(Math.exp(-engram.decayRate * Math.max(0, ageDays)))
      const emotionalBoost = 0.8 + engram.emotionalWeight * 0.2
      const contradictionPenalty = 1 - engram.contradictionScore * 0.45
      const score = clamp(semanticSimilarity * engram.confidence * emotionalBoost * recencyMultiplier * contradictionPenalty)
      return {
        engram,
        score,
        reasons: {
          semanticSimilarity,
          confidence: engram.confidence,
          emotionalBoost,
          recencyMultiplier,
        },
      }
    })

    return scored
      .filter(item => item.score > 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? 5)
  }
}
