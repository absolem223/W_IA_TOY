import { globalKnowledgeStore } from './KnowledgeStore'
import { globalCognitiveSession } from './CognitiveSessionManager'
import type { KnowledgeNode, RetrievalQuery } from './types'
import { BrowserWindow } from 'electron'

export type RetrievalStrategyType = 'exact' | 'lexical' | 'semantic' | 'temporal'

export class RetrievalStrategyOrchestrator {
  
  /**
   * Orchestrates retrieval across different layers.
   */
  async retrieve(strategy: RetrievalStrategyType, queryText: string, options?: Omit<RetrievalQuery, 'text'>): Promise<KnowledgeNode[]> {
    let rawResults: KnowledgeNode[] = []

    switch (strategy) {
      case 'exact':
        rawResults = await this.exactRetrieval(queryText, options)
        break
      case 'lexical':
        rawResults = await this.lexicalRetrieval(queryText, options)
        break
      case 'semantic':
        rawResults = await this.semanticRetrieval(queryText, options)
        break
      case 'temporal':
        rawResults = await this.temporalRetrieval(queryText, options)
        break
      default:
        throw new Error(`Unsupported retrieval strategy: ${strategy}`)
    }

    // Context Assembly Layer
    const assembled = this.assembleContext(rawResults, {
      maxTokensApprox: 3000,
      balanceSources: true
    })

    // Record retrieval event for governance (increment frequency, update last_retrieved_at)
    if (assembled.length > 0) {
      globalKnowledgeStore.recordRetrievalEvent(assembled.map(n => n.id))
    }

    try {
      const trace = {
        query: queryText,
        strategy,
        rawCandidatesCount: rawResults.length,
        finalContextCount: assembled.length,
        topScores: assembled.slice(0,3).map(n => ({ id: n.id, score: (n.trustScore * (1 + n.usageScore)).toFixed(2) }))
      }
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('dev:context-assembly-trace', trace)
      })
    } catch {}

    return assembled
  }

  private async exactRetrieval(queryText: string, options?: Omit<RetrievalQuery, 'text'>): Promise<KnowledgeNode[]> {
    // Escapes special FTS5 characters to ensure an exact literal match.
    // E.g., "queryText" instead of generic BM25 words.
    const escaped = `"${queryText.replace(/"/g, '""')}"`
    return globalKnowledgeStore.lexicalSearch({
      text: escaped,
      ...options
    })
  }

  private async lexicalRetrieval(queryText: string, options?: Omit<RetrievalQuery, 'text'>): Promise<KnowledgeNode[]> {
    // Basic BM25 using FTS5 Porter stemmer
    return globalKnowledgeStore.lexicalSearch({
      text: queryText,
      ...options
    })
  }

  private async semanticRetrieval(queryText: string, options?: Omit<RetrievalQuery, 'text'>): Promise<KnowledgeNode[]> {
    // Placeholder for Layer 3: Semantic Embeddings
    console.warn('[RETRIEVAL] Semantic retrieval is not yet fully implemented. Falling back to Lexical.')
    return this.lexicalRetrieval(queryText, options)
  }

  private async temporalRetrieval(queryText: string, options?: Omit<RetrievalQuery, 'text'>): Promise<KnowledgeNode[]> {
    // Example: fetch nodes related to time, or sorted strictly by processing_timestamp.
    // For now, doing a standard lexical search but we would modify the ORDER BY in SQL to temporal.
    console.warn('[RETRIEVAL] Temporal retrieval uses basic lexical search for now.')
    return this.lexicalRetrieval(queryText, options)
  }

  /**
   * CONTEXT ASSEMBLY LAYER
   * Deduplicates, balances sources, orders intelligently, and applies token budgets.
   */
  private assembleContext(nodes: KnowledgeNode[], config: { maxTokensApprox: number, balanceSources: boolean }): KnowledgeNode[] {
    // 1. Deduplication
    const uniqueMap = new Map<string, KnowledgeNode>()
    for (const node of nodes) {
      if (!uniqueMap.has(node.id)) {
        uniqueMap.set(node.id, node)
      } else {
        // Merge strategy for exact duplicates: could boost score
        const existing = uniqueMap.get(node.id)!
        existing.trustScore += 0.05
      }
    }

    let processed = Array.from(uniqueMap.values())

    // 2. Source Balancing (Ensure one source doesn't monopolize if we have multiple)
    if (config.balanceSources) {
      const bySource: Record<string, KnowledgeNode[]> = {}
      for (const node of processed) {
        const src = node.provenance.sourceOrigin
        if (!bySource[src]) bySource[src] = []
        bySource[src].push(node)
      }
      
      const balanced: KnowledgeNode[] = []
      let sourceKeys = Object.keys(bySource)
      let i = 0
      while (balanced.length < processed.length) {
        for (const src of sourceKeys) {
          if (bySource[src][i]) {
            balanced.push(bySource[src][i])
          }
        }
        i++
      }
      processed = balanced
    }

    // 3. Intelligent Ordering: Apply Cognitive Session Weights
    const weights = globalCognitiveSession.getRetrievalWeights()
    
    processed.sort((a, b) => {
      // Calculate adjusted score based on session strategy
      const getAdjustedScore = (node: KnowledgeNode) => {
        let base = (node.trustScore * weights.trustMultiplier) + (node.usageScore * weights.usageMultiplier)
        if (node.level === 'concept' || node.level === 'domain') {
          base *= weights.conceptBoost
        }
        return base
      }

      const scoreA = getAdjustedScore(a)
      const scoreB = getAdjustedScore(b)
      return scoreB - scoreA
    })

    // 4. Advanced Token Budgeting
    const finalSelection: KnowledgeNode[] = []
    let currentTokens = 0
    for (const node of processed) {
      const tokensApprox = Math.ceil((node.content.length) / 4)
      if (currentTokens + tokensApprox <= config.maxTokensApprox) {
        finalSelection.push(node)
        currentTokens += tokensApprox
      } else {
        // We reached the budget limit. Stop adding full chunks.
        // We do not truncate persistent chunks because they represent factual DB rows.
        break
      }
    }

    return finalSelection
  }
}

export const globalRetrievalOrchestrator = new RetrievalStrategyOrchestrator()
