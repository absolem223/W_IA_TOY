import { ExtractedIdentity } from './identityLayer'

// ── Types ──

export interface TopicNode {
  id: string
  keywords: string[]
  weight: number
  lastActive: number
  relatedIds: string[]
}

export interface CognitiveState {
  activeTask: string | null
  activeTopic: string | null
  recentIntents: string[]
  contextPressure: number
  topicGraph: Record<string, TopicNode>
}

// ── Heuristic Extractor ──
// Extremely naive NLP for extracting "topics" in Spanish
function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) || []
  const stopwords = new Set(['para', 'como', 'pero', 'esto', 'esta', 'este', 'eso', 'aquello', 'cuando', 'donde', 'quien', 'porque', 'tiene', 'tengo', 'hacer', 'quiero', 'necesito', 'estoy', 'sobre'])
  return [...new Set(words.filter(w => !stopwords.has(w)))]
}

export class CognitiveLayer {
  private state: CognitiveState = {
    activeTask: null,
    activeTopic: null,
    recentIntents: [],
    contextPressure: 0,
    topicGraph: {}
  }

  // ── Public API ──

  public processTurn(userText: string, aiText: string): void {
    const keywords = extractKeywords(userText)
    
    // 1. Detect Topic Switch vs Continuation
    const { matchedTopic, isNew } = this.resolveTopic(keywords)

    if (matchedTopic !== this.state.activeTopic) {
      if (this.state.activeTopic) {
        console.log(`[TOPIC_SWITCH] Transition: '${this.state.activeTopic}' -> '${matchedTopic}'`)
      } else {
        console.log(`[ATTENTION_ACTIVE_TOPIC] Focus established: '${matchedTopic}'`)
      }

      // Check if restoring a past topic
      if (!isNew && this.state.activeTopic !== null) {
        console.log(`[FOCUS_RESTORE] Returning to previous topic: '${matchedTopic}'`)
      }
      this.state.activeTopic = matchedTopic
    }

    // 2. Intent Stack
    this.state.recentIntents.push(userText.slice(0, 50))
    if (this.state.recentIntents.length > 5) {
      this.state.recentIntents.shift()
    }

    // 3. Context Pressure (decay + new)
    this.state.contextPressure = Math.min(1.0, this.state.contextPressure + (keywords.length * 0.05))
    console.log(`[CONTEXT_PRESSURE] Current: ${(this.state.contextPressure * 100).toFixed(0)}%`)

    // Decay older topics
    this.decayGraph()
  }

  public getActiveTopic(): string | null {
    return this.state.activeTopic
  }

  public getRecentIntents(): string[] {
    return [...this.state.recentIntents]
  }

  public filterRelevantMemories(memories: any[], limit: number = 5): any[] {
    // Attention Routing: Filter memories based on active topic
    if (!this.state.activeTopic || memories.length === 0) return memories.slice(0, limit)

    const activeNode = this.state.topicGraph[this.state.activeTopic]
    if (!activeNode) return memories.slice(0, limit)

    const scored = memories.map(m => {
      let score = 0
      const content = (m.content || m.value || '').toString().toLowerCase()
      // If memory contains active keywords, bump score
      activeNode.keywords.forEach(k => {
        if (content.includes(k)) score += 10
      })
      return { memory: m, score }
    })

    const filtered = scored.sort((a, b) => b.score - a.score).filter(s => s.score > 0).map(s => s.memory)

    const noiseRatio = 1 - (filtered.length / Math.max(1, memories.length))
    console.log(`[MEMORY_NOISE_RATIO] ${(noiseRatio * 100).toFixed(0)}% memories ignored as noise for current focus.`)

    return filtered.length > 0 ? filtered.slice(0, limit) : memories.slice(0, limit)
  }

  // ── Internals ──

  private resolveTopic(keywords: string[]): { matchedTopic: string, isNew: boolean } {
    if (keywords.length === 0) return { matchedTopic: this.state.activeTopic || 'general', isNew: false }

    // Find best match in graph
    let bestMatch: string | null = null
    let maxOverlap = 0

    for (const [id, node] of Object.entries(this.state.topicGraph)) {
      const overlap = keywords.filter(k => node.keywords.includes(k)).length
      if (overlap > maxOverlap) {
        maxOverlap = overlap
        bestMatch = id
      }
    }

    if (bestMatch && maxOverlap >= 2) {
      // Update existing
      const node = this.state.topicGraph[bestMatch]
      node.weight += 1
      node.lastActive = Date.now()
      node.keywords = [...new Set([...node.keywords, ...keywords])].slice(-15)
      return { matchedTopic: bestMatch, isNew: false }
    } else {
      // Create new
      const newTopicId = `topic-${keywords.slice(0, 2).join('-')}-${Date.now()}`
      this.state.topicGraph[newTopicId] = {
        id: newTopicId,
        keywords: keywords.slice(0, 10),
        weight: 1,
        lastActive: Date.now(),
        relatedIds: this.state.activeTopic ? [this.state.activeTopic] : []
      }
      return { matchedTopic: newTopicId, isNew: true }
    }
  }

  private decayGraph() {
    this.state.contextPressure *= 0.9 // 10% decay per turn
    const now = Date.now()
    for (const [id, node] of Object.entries(this.state.topicGraph)) {
      if (now - node.lastActive > 1000 * 60 * 30) {
        // Topic hasn't been active in 30 minutes, decay weight
        node.weight *= 0.8
      }
    }
  }
}
