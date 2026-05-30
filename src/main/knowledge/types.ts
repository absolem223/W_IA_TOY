export type KnowledgeLevel = 'ephemeral' | 'session' | 'persistent' | 'archival' | 'summary' | 'concept' | 'domain'

export type CognitiveSessionType = 'research' | 'coding' | 'planning' | 'creative' | 'general'

export interface IntentState {
  activeObjectives: string[]
  openThreads: string[]
  currentFocus: string
  sessionType: CognitiveSessionType
}

export interface ProvenanceTracking {
  sourceOrigin: string
  pipelineVersion: string
  transcriptSource: string
  confidence: number
  processingTimestamp: number
  chunkLineage: string | null
}

export interface KnowledgeNode {
  id: string
  level: KnowledgeLevel
  content: string
  metadata: Record<string, any>
  provenance: ProvenanceTracking
  expiresAt: number | null
  isPinned: boolean
  trustScore: number
  usageScore: number
  decayScore: number
  retrievalFrequency: number
  lastRetrievedAt: number
}

export interface KnowledgeEdge {
  sourceId: string
  targetId: string
  relationType: string
  weight: number
}

export interface RetrievalQuery {
  text?: string
  levels?: KnowledgeLevel[]
  minTrustScore?: number
  sourceOrigin?: string
  limit?: number
}
