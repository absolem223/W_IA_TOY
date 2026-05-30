import { globalKnowledgeStore } from './KnowledgeStore'
import type { KnowledgeNode } from './types'

export class MemoryConsolidator {
  
  /**
   * Applies decay to usage_score for all nodes.
   * Runs periodically (e.g., daily).
   */
  applyDecay() {
    if (globalKnowledgeStore.isDegraded || !(globalKnowledgeStore as any).db) return
    // We decay usage_score by 10%
    const stmt = (globalKnowledgeStore as any).db.prepare(`
      UPDATE nodes 
      SET decay_score = decay_score + (usage_score * 0.1),
          usage_score = usage_score * 0.9
      WHERE usage_score > 0
    `)
    const result = stmt.run()
    console.log(`[CONSOLIDATOR] Applied decay to ${result.changes} nodes.`)
  }

  /**
   * Identifies un-used nodes and lowers their trust score or moves them to archival.
   */
  archiveStaleNodes(thresholdDays: number = 30) {
    if (globalKnowledgeStore.isDegraded || !(globalKnowledgeStore as any).db) return
    const thresholdMs = Date.now() - (thresholdDays * 24 * 60 * 60 * 1000)
    
    // Archiving logic: If a node has low usage and hasn't been retrieved
    const stmt = (globalKnowledgeStore as any).db.prepare(`
      UPDATE nodes
      SET level = 'archival',
          trust_score = trust_score * 0.5
      WHERE level = 'persistent' 
        AND is_pinned = 0
        AND last_retrieved_at < ?
        AND usage_score < 1.0
    `)
    const result = stmt.run(thresholdMs)
    console.log(`[CONSOLIDATOR] Archived ${result.changes} stale nodes.`)
  }

  /**
   * Finds contradictions or duplicates and merges them.
   * For now, exact content deduplication via SQLite grouping.
   */
  mergeExactDuplicates() {
    if (globalKnowledgeStore.isDegraded || !(globalKnowledgeStore as any).db) return
    const db = (globalKnowledgeStore as any).db
    
    // Find content with multiple nodes
    const duplicates = db.prepare(`
      SELECT content, COUNT(*) as c, MAX(id) as keep_id 
      FROM nodes 
      GROUP BY content 
      HAVING c > 1
    `).all()

    let mergedCount = 0

    for (const dup of duplicates) {
      // Get all IDs except the one we want to keep
      const idsToDelete = db.prepare(`
        SELECT id FROM nodes WHERE content = ? AND id != ?
      `).all(dup.content, dup.keep_id).map((r: any) => r.id)

      if (idsToDelete.length > 0) {
        // Boost usage score of the kept node
        db.prepare(`UPDATE nodes SET usage_score = usage_score + ? WHERE id = ?`)
          .run(idsToDelete.length * 0.5, dup.keep_id)
        
        // Delete duplicates
        const placeholders = idsToDelete.map(() => '?').join(',')
        db.prepare(`DELETE FROM nodes WHERE id IN (${placeholders})`).run(...idsToDelete)
        
        mergedCount += idsToDelete.length
      }
    }

    console.log(`[CONSOLIDATOR] Merged ${mergedCount} exact duplicate chunks.`)
  }

  /**
   * Cognitive Compression: Hierarchical Folding
   * Upgrades highly used chunks to 'summary' or 'concept' levels to prevent graph fragmentation.
   */
  buildHierarchicalCompression() {
    if (globalKnowledgeStore.isDegraded || !(globalKnowledgeStore as any).db) return
    const db = (globalKnowledgeStore as any).db

    // 1. Promote highly-used persistent chunks to 'summary'
    const summaryPromotion = db.prepare(`
      UPDATE nodes
      SET level = 'summary',
          trust_score = trust_score + 0.1
      WHERE level = 'persistent'
        AND usage_score > 5.0
        AND retrieval_frequency > 10
    `)
    const sumResult = summaryPromotion.run()
    if (sumResult.changes > 0) {
      console.log(`[CONSOLIDATOR] Promoted ${sumResult.changes} nodes to 'summary' level.`)
    }

    // 2. Promote highly-used summaries to 'concept'
    const conceptPromotion = db.prepare(`
      UPDATE nodes
      SET level = 'concept',
          trust_score = trust_score + 0.2
      WHERE level = 'summary'
        AND usage_score > 10.0
        AND retrieval_frequency > 25
    `)
    const concResult = conceptPromotion.run()
    if (concResult.changes > 0) {
      console.log(`[CONSOLIDATOR] Promoted ${concResult.changes} nodes to 'concept' level.`)
    }
  }

  /**
   * Run the full consolidation pipeline.
   */
  runConsolidationCycle() {
    console.log('[CONSOLIDATOR] Starting memory consolidation cycle...')
    globalKnowledgeStore.cleanupExpired()
    this.applyDecay()
    this.archiveStaleNodes(30)
    this.mergeExactDuplicates()
    this.buildHierarchicalCompression()
    console.log('[CONSOLIDATOR] Cycle complete.')
  }
}

export const globalMemoryConsolidator = new MemoryConsolidator()
