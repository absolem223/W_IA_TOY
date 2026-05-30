export type RetrievalSource = 'web' | 'youtube' | 'drive' | 'docs' | 'multimedia' | 'local'

export interface RetrievalResult {
  id: string
  title: string
  url: string
  snippet: string
  source: RetrievalSource
  metadata?: Record<string, any>
  relevanceScore?: number
}

export interface SearchMemoryEntry {
  query: string
  source: RetrievalSource
  timestamp: number
  resultsFound: number
  selectedUrls: string[]
}

export interface SearchContextBudget {
  maxResultsTotal: number
  maxTokensApprox: number
  minRelevanceScore: number
}
