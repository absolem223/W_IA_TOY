import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import type { KnowledgeNode, KnowledgeEdge, RetrievalQuery } from './types'

export class KnowledgeStore {
  public db: Database.Database | null = null
  public isDegraded: boolean = false
  public degradedReason: string = ''

  constructor() {
    try {
      const userData = app.getPath('userData')
      const dbPath = join(userData, 'knowledge.sqlite')
      this.db = new Database(dbPath)
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('foreign_keys = ON')
      this.initSchema()
    } catch (e: any) {
      this.isDegraded = true
      this.degradedReason = e.message
      console.error('[KNOWLEDGE] CRITICAL: Failed to initialize SQLite. Entering degraded mode. ABI mismatch?', e.message)
    }
  }

  private initSchema() {
    if (!this.db) return
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        level TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL,
        expires_at INTEGER,
        is_pinned INTEGER DEFAULT 0,
        trust_score REAL DEFAULT 1.0,
        usage_score REAL DEFAULT 0.0,
        decay_score REAL DEFAULT 0.0,
        retrieval_frequency INTEGER DEFAULT 0,
        last_retrieved_at INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provenance (
        node_id TEXT PRIMARY KEY,
        source_origin TEXT NOT NULL,
        pipeline_version TEXT NOT NULL,
        transcript_source TEXT NOT NULL,
        confidence REAL NOT NULL,
        processing_timestamp INTEGER NOT NULL,
        chunk_lineage TEXT,
        FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS edges (
        source_id TEXT,
        target_id TEXT,
        relation_type TEXT,
        weight REAL DEFAULT 1.0,
        PRIMARY KEY (source_id, target_id, relation_type),
        FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
      );

      -- FTS5 para Layer 2: Lexical Retrieval
      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
        content,
        node_id UNINDEXED,
        tokenize='porter'
      );
    `)
  }

  // Transactional insert for a Knowledge Node
  upsertNode(node: KnowledgeNode) {
    if (this.isDegraded || !this.db) return

    const insertNode = this.db.prepare(`
      INSERT OR REPLACE INTO nodes (id, level, content, metadata, expires_at, is_pinned, trust_score, usage_score, decay_score, retrieval_frequency, last_retrieved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertProvenance = this.db.prepare(`
      INSERT OR REPLACE INTO provenance (node_id, source_origin, pipeline_version, transcript_source, confidence, processing_timestamp, chunk_lineage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const insertFts = this.db.prepare(`
      INSERT OR REPLACE INTO nodes_fts (rowid, content, node_id)
      VALUES ((SELECT rowid FROM nodes_fts WHERE node_id = ?), ?, ?)
    `)

    const tx = this.db.transaction(() => {
      insertNode.run(
        node.id, node.level, node.content, JSON.stringify(node.metadata), 
        node.expiresAt, node.isPinned ? 1 : 0, node.trustScore, 
        node.usageScore, node.decayScore, node.retrievalFrequency, node.lastRetrievedAt, Date.now()
      )
      
      const p = node.provenance
      insertProvenance.run(
        node.id, p.sourceOrigin, p.pipelineVersion, p.transcriptSource, 
        p.confidence, p.processingTimestamp, p.chunkLineage
      )

      insertFts.run(node.id, node.content, node.id)
    })

    tx()
  }

  addEdge(edge: KnowledgeEdge) {
    if (this.isDegraded || !this.db) return
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO edges (source_id, target_id, relation_type, weight)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(edge.sourceId, edge.targetId, edge.relationType, edge.weight)
  }

  // Maintenance: Cleanup expired ephemeral/session nodes
  cleanupExpired() {
    if (this.isDegraded || !this.db) return
    const now = Date.now()
    const stmt = this.db.prepare(`
      DELETE FROM nodes 
      WHERE is_pinned = 0 
      AND expires_at IS NOT NULL 
      AND expires_at < ?
    `)
    const result = stmt.run(now)
    console.log(`[KNOWLEDGE] Cleaned up ${result.changes} expired nodes.`)
    
    // Clean up orphaned FTS entries
    this.db.exec(`INSERT INTO nodes_fts(nodes_fts) VALUES('rebuild');`)
  }

  // Governance: Track retrieval events
  recordRetrievalEvent(nodeIds: string[]) {
    if (this.isDegraded || !this.db || !nodeIds.length) return
    const placeholders = nodeIds.map(() => '?').join(',')
    const now = Date.now()
    const stmt = this.db.prepare(`
      UPDATE nodes 
      SET retrieval_frequency = retrieval_frequency + 1,
          last_retrieved_at = ?,
          usage_score = usage_score + 0.1
      WHERE id IN (${placeholders})
    `)
    stmt.run(now, ...nodeIds)
  }

  // Layer 2: Lexical Retrieval (BM25 via FTS5)
  lexicalSearch(query: RetrievalQuery): KnowledgeNode[] {
    if (this.isDegraded || !this.db) return []

    let sql = `
      SELECT n.*, p.source_origin, p.pipeline_version, p.transcript_source, p.confidence, p.processing_timestamp, p.chunk_lineage
      FROM nodes_fts f
      JOIN nodes n ON f.node_id = n.id
      JOIN provenance p ON n.id = p.node_id
    `
    const params: any[] = []

    if (query.text) {
      sql += ` WHERE nodes_fts MATCH ?`
      params.push(query.text) // FTS query syntax, e.g., "sqlite OR database"
    } else {
      sql += ` WHERE 1=1`
    }

    if (query.levels && query.levels.length > 0) {
      const placeholders = query.levels.map(() => '?').join(',')
      sql += ` AND n.level IN (${placeholders})`
      params.push(...query.levels)
    }

    if (query.sourceOrigin) {
      sql += ` AND p.source_origin = ?`
      params.push(query.sourceOrigin)
    }

    if (query.minTrustScore !== undefined) {
      sql += ` AND n.trust_score >= ?`
      params.push(query.minTrustScore)
    }

    sql += ` ORDER BY rank LIMIT ?`
    params.push(query.limit || 10)

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params)

    return rows.map((r: any) => ({
      id: r.id,
      level: r.level as any,
      content: r.content,
      metadata: JSON.parse(r.metadata),
      expiresAt: r.expires_at,
      isPinned: r.is_pinned === 1,
      trustScore: r.trust_score,
      usageScore: r.usage_score,
      decayScore: r.decay_score,
      retrievalFrequency: r.retrieval_frequency,
      lastRetrievedAt: r.last_retrieved_at,
      provenance: {
        sourceOrigin: r.source_origin,
        pipelineVersion: r.pipeline_version,
        transcriptSource: r.transcript_source,
        confidence: r.confidence,
        processingTimestamp: r.processing_timestamp,
        chunkLineage: r.chunk_lineage
      }
    }))
  }

  // Analytics & DevTools: Get the entire graph
  getFullGraph(): { nodes: KnowledgeNode[], edges: KnowledgeEdge[] } {
    if (this.isDegraded || !this.db) return { nodes: [], edges: [] }

    const dbNodes = this.db.prepare(`
      SELECT n.*, p.source_origin, p.pipeline_version, p.transcript_source, p.confidence, p.processing_timestamp, p.chunk_lineage
      FROM nodes n
      LEFT JOIN provenance p ON n.id = p.node_id
    `).all()

    const nodes: KnowledgeNode[] = dbNodes.map((r: any) => ({
      id: r.id,
      level: r.level,
      content: r.content,
      metadata: JSON.parse(r.metadata || '{}'),
      expiresAt: r.expires_at,
      isPinned: r.is_pinned === 1,
      trustScore: r.trust_score,
      usageScore: r.usage_score,
      decayScore: r.decay_score,
      retrievalFrequency: r.retrieval_frequency,
      lastRetrievedAt: r.last_retrieved_at,
      provenance: {
        sourceOrigin: r.source_origin || 'unknown',
        pipelineVersion: r.pipeline_version || 'unknown',
        transcriptSource: r.transcript_source || 'unknown',
        confidence: r.confidence || 0,
        processingTimestamp: r.processing_timestamp || 0,
        chunkLineage: r.chunk_lineage || null
      }
    }))

    const edgesRaw = this.db.prepare(`SELECT * FROM edges`).all()
    const edges: KnowledgeEdge[] = edgesRaw.map((e: any) => ({
      sourceId: e.source_id,
      targetId: e.target_id,
      relationType: e.relation_type,
      weight: e.weight
    }))

    return { nodes, edges }
  }

  getMetrics() {
    if (this.isDegraded || !this.db) {
      return {
        totalNodes: 0, persistentNodes: 0, archivalNodes: 0,
        totalEdges: 0, avgTrustScore: 0, avgUsageScore: 0, dbSize: 0,
        isDegraded: true, degradedReason: this.degradedReason
      }
    }

    const nodeCount = this.db.prepare(`SELECT COUNT(*) as c FROM nodes`).get() as any
    const persistentCount = this.db.prepare(`SELECT COUNT(*) as c FROM nodes WHERE level = 'persistent'`).get() as any
    const archivalCount = this.db.prepare(`SELECT COUNT(*) as c FROM nodes WHERE level = 'archival'`).get() as any
    const edgeCount = this.db.prepare(`SELECT COUNT(*) as c FROM edges`).get() as any
    const avgTrust = this.db.prepare(`SELECT AVG(trust_score) as a FROM nodes`).get() as any
    const avgUsage = this.db.prepare(`SELECT AVG(usage_score) as a FROM nodes`).get() as any

    return {
      totalNodes: nodeCount.c,
      persistentNodes: persistentCount.c,
      archivalNodes: archivalCount.c,
      totalEdges: edgeCount.c,
      avgTrustScore: avgTrust.a || 0,
      avgUsageScore: avgUsage.a || 0,
      dbSize: 0 // Could check file size in bytes if needed
    }
  }
}

export const globalKnowledgeStore = new KnowledgeStore()
