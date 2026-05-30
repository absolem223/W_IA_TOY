/**
 * Memory Prioritization: Scores memories for injection based on:
 * - Relevance to current input
 * - Recency
 * - Confidence
 * - Topic affinity
 * - Contradiction weight
 */

export interface MemoryItem {
  type: string
  label: string
  score: number
  content?: string
  timestamp?: number
  confidence?: number
}

export interface MemoryScoreBreakdown {
  item: MemoryItem
  relevance: number // 0-1, semantic similarity to input
  recency: number // 0-1, 1 = just created, 0 = old
  confidence: number // 0-1, trust in memory
  topicAffinity: number // 0-1, matches active topic
  contradictionWeight: number // 0-1, conflict penalty
  finalScore: number // weighted combo
}

export class MemoryPrioritizer {
  private weights = {
    relevance: 0.35,
    recency: 0.15,
    confidence: 0.20,
    topicAffinity: 0.20,
    contradictionWeight: -0.10, // penalty
  }

  /**
   * Score a memory item for injection priority.
   */
  public scoreMemory(item: MemoryItem, input: { userInput: string; activeTopic?: string; sessionAgeMs?: number }): MemoryScoreBreakdown {
    const relevance = this.computeRelevance(item, input.userInput)
    const recency = this.computeRecency(item.timestamp || Date.now(), input.sessionAgeMs || 0)
    const confidence = item.confidence ?? 0.7
    const topicAffinity = this.computeTopicAffinity(item, input.activeTopic)
    const contradictionWeight = this.computeContradictionPenalty(item)

    const finalScore =
      relevance * this.weights.relevance +
      recency * this.weights.recency +
      confidence * this.weights.confidence +
      topicAffinity * this.weights.topicAffinity +
      contradictionWeight * this.weights.contradictionWeight

    return {
      item,
      relevance,
      recency,
      confidence,
      topicAffinity,
      contradictionWeight,
      finalScore: Math.max(0, Math.min(1, finalScore)),
    }
  }

  /**
   * Filter and rank memories for injection.
   */
  public prioritize(
    memories: MemoryItem[],
    input: { userInput: string; activeTopic?: string; sessionAgeMs?: number; maxMemories?: number }
  ): MemoryScoreBreakdown[] {
    const scored = memories
      .map((item) => this.scoreMemory(item, input))
      .filter((scored) => scored.finalScore > 0.1) // filter out noise
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, input.maxMemories ?? 8)

    return scored
  }

  /**
   * Compute relevance: simple token overlap with user input.
   * In production, use semantic embedding similarity.
   */
  private computeRelevance(item: MemoryItem, userInput: string): number {
    const label = item.label.toLowerCase()
    const input = userInput.toLowerCase()

    // Exact match bonus
    if (input.includes(label)) return 0.9

    // Partial word match
    const itemWords = label.split(/\s+/)
    const inputWords = input.split(/\s+/)
    const matches = itemWords.filter((word) => inputWords.some((iw) => iw.includes(word) || word.includes(iw)))

    if (matches.length === 0) return 0.1
    return Math.min(0.85, 0.3 + (matches.length / itemWords.length) * 0.5)
  }

  /**
   * Compute recency: exponential decay over session time.
   */
  private computeRecency(itemTimestamp: number, sessionAgeMs: number): number {
    const now = Date.now()
    const ageMs = now - itemTimestamp
    const hoursOld = ageMs / (1000 * 60 * 60)

    // Decay: -0.1 per hour, floor at 0.1
    return Math.max(0.1, 1 - hoursOld * 0.1)
  }

  /**
   * Compute topic affinity: bonus if matches active topic.
   */
  private computeTopicAffinity(item: MemoryItem, activeTopic?: string): number {
    if (!activeTopic) return 0.5 // neutral

    const label = item.label.toLowerCase()
    const topic = activeTopic.toLowerCase()

    if (label.includes(topic) || topic.includes(label.substring(0, 10))) {
      return 0.95
    }

    // Partial match
    if (label.split(/\s+/).some((word) => topic.includes(word))) {
      return 0.7
    }

    return 0.3
  }

  /**
   * Penalty for contradictions or conflicts.
   */
  private computeContradictionPenalty(item: MemoryItem): number {
    // Item type "contradiction" or "conflict" reduces score
    if (item.type.includes('contradiction') || item.type.includes('conflict')) {
      return -0.5
    }

    // Older contradictions are less relevant
    return 0
  }

  /**
   * Estimate total injection size for a set of prioritized memories.
   */
  public estimateInjectionSize(scored: MemoryScoreBreakdown[]): number {
    return scored.reduce((size, s) => size + (s.item.content?.length ?? 0) + s.item.label.length + 50, 0)
  }

  /**
   * Trim memories if total size exceeds budget.
   */
  public trimToBudget(scored: MemoryScoreBreakdown[], charBudget: number): MemoryScoreBreakdown[] {
    let totalSize = 0
    const result: MemoryScoreBreakdown[] = []

    for (const item of scored) {
      const itemSize = (item.item.content?.length ?? 0) + item.item.label.length + 50
      if (totalSize + itemSize <= charBudget) {
        result.push(item)
        totalSize += itemSize
      } else {
        break
      }
    }

    return result
  }
}
