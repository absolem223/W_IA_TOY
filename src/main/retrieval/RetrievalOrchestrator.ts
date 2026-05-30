import type { MemoryManager } from '../memory/MemoryManager'
import type { OAuthSessionManager } from '../oauth/OAuthSessionManager'
import type { RetrievalResult, RetrievalSource, SearchContextBudget, SearchMemoryEntry } from './types'

export class RetrievalOrchestrator {
  private memoryManager?: MemoryManager
  private oauthManager?: OAuthSessionManager
  
  constructor(memoryManager?: MemoryManager, oauthManager?: OAuthSessionManager) {
    this.memoryManager = memoryManager
    this.oauthManager = oauthManager
  }

  /**
   * Main entry point for searching the web.
   */
  async searchWeb(query: string, maxResults: number = 5): Promise<RetrievalResult[]> {
    // Basic Google Custom Search implementation (fallback to mock if no keys)
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY
    const cx = process.env.GOOGLE_SEARCH_CX
    
    let rawResults: any[] = []
    
    if (apiKey && cx) {
      const res = await fetch(`https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}&num=${Math.min(maxResults, 10)}`)
      if (res.ok) {
        const data = await res.json()
        rawResults = data.items || []
      }
    } else {
      // Mock for development / testing without keys
      console.log(`[RETRIEVAL] Warning: No GOOGLE_SEARCH_API_KEY/CX provided. Mocking results for query: ${query}`)
      rawResults = [
        { link: 'https://example.com/1', title: `Mock Result 1 for ${query}`, snippet: 'This is a mocked search result snippet due to missing API keys.' },
        { link: 'https://example.com/2', title: `Mock Result 2 for ${query}`, snippet: 'Another mock snippet providing artificial context.' }
      ]
    }

    const normalized: RetrievalResult[] = rawResults.map(r => ({
      id: r.link,
      title: r.title,
      url: r.link,
      snippet: r.snippet,
      source: 'web'
    }))

    this.recordSearchMemory(query, 'web', normalized)
    return this.applyBudget(normalized, { maxResultsTotal: maxResults, maxTokensApprox: 2000, minRelevanceScore: 0 })
  }

  /**
   * Main entry point for YouTube search.
   */
  async searchYouTube(query: string, accountId?: string, maxResults: number = 5): Promise<RetrievalResult[]> {
    // If accountId is provided, we can use the user's OAuth token for personalized results, 
    // otherwise use server API key.
    let authHeader = ''
    let apiKeyParam = ''
    
    if (accountId && this.oauthManager) {
      try {
        const token = await this.oauthManager.getValidAccessToken(accountId)
        authHeader = `Bearer ${token}`
      } catch (e) {
        console.warn(`[RETRIEVAL] Failed to get OAuth token for YouTube search, falling back to API key.`)
      }
    }
    
    if (!authHeader) {
      const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_SEARCH_API_KEY
      if (!apiKey) {
        console.log(`[RETRIEVAL] Warning: No YOUTUBE_API_KEY provided. Mocking results for query: ${query}`)
        const mock: RetrievalResult[] = [{
          id: 'mock-yt-1', title: `Mock Video for ${query}`, url: 'https://youtube.com/watch?v=mock',
          snippet: 'Mocked youtube description.', source: 'youtube', metadata: { channelTitle: 'Mock Channel' }
        }]
        this.recordSearchMemory(query, 'youtube', mock)
        return mock
      }
      apiKeyParam = `&key=${apiKey}`
    }

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=${Math.min(maxResults, 50)}&type=video${apiKeyParam}`
    
    const res = await fetch(url, {
      headers: authHeader ? { Authorization: authHeader } : {}
    })
    
    if (!res.ok) {
      throw new Error(`YouTube API Error: ${res.statusText}`)
    }

    const data = await res.json()
    const rawResults = data.items || []

    const normalized: RetrievalResult[] = rawResults.map((r: any) => ({
      id: r.id.videoId,
      title: r.snippet.title,
      url: `https://www.youtube.com/watch?v=${r.id.videoId}`,
      snippet: r.snippet.description,
      source: 'youtube',
      metadata: {
        channelId: r.snippet.channelId,
        channelTitle: r.snippet.channelTitle,
        publishedAt: r.snippet.publishedAt
      }
    }))

    this.recordSearchMemory(query, 'youtube', normalized)
    return this.applyBudget(normalized, { maxResultsTotal: maxResults, maxTokensApprox: 2000, minRelevanceScore: 0 })
  }

  /**
   * Apply context budgeting (deduplication, truncation, ranking).
   */
  private applyBudget(results: RetrievalResult[], budget: SearchContextBudget): RetrievalResult[] {
    // 1. Deduplicate by URL
    const unique = new Map<string, RetrievalResult>()
    for (const r of results) {
      if (!unique.has(r.url)) unique.set(r.url, r)
    }
    
    let processed = Array.from(unique.values())
    
    // 2. Rank (if relevance score exists, otherwise keep original order which is usually sorted by provider)
    processed.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    
    // 3. Truncate max results
    if (processed.length > budget.maxResultsTotal) {
      processed = processed.slice(0, budget.maxResultsTotal)
    }

    // 4. Token budgeting (rough approximation: 4 chars = 1 token)
    let currentTokens = 0
    for (const r of processed) {
      const snippetTokens = Math.ceil((r.snippet?.length || 0) / 4)
      if (currentTokens + snippetTokens > budget.maxTokensApprox) {
        // Truncate the snippet to fit
        const remainingTokens = budget.maxTokensApprox - currentTokens
        if (remainingTokens > 10) {
           r.snippet = r.snippet.substring(0, remainingTokens * 4) + '...'
           currentTokens += remainingTokens
        } else {
           r.snippet = ''
        }
      } else {
        currentTokens += snippetTokens
      }
    }

    return processed
  }

  /**
   * Persist metadata about searches performed.
   */
  private recordSearchMemory(query: string, source: RetrievalSource, results: RetrievalResult[]) {
    if (!this.memoryManager) return
    
    const entry: SearchMemoryEntry = {
      query,
      source,
      timestamp: Date.now(),
      resultsFound: results.length,
      selectedUrls: results.map(r => r.url)
    }
    
    // Using a dynamic semantic profile key to store recent searches (Capped history)
    try {
      const profile = this.memoryManager.getProfile().profile || {}
      const existingHistoryStr = profile['search_history']?.value || '[]'
      let history: SearchMemoryEntry[] = []
      if (typeof existingHistoryStr === 'string') {
        try { history = JSON.parse(existingHistoryStr) } catch { }
      }
      
      // Keep last 20 searches
      history.unshift(entry)
      if (history.length > 20) history = history.slice(0, 20)
      
      // Update asynchronously without blocking the retrieval pipeline
      this.memoryManager.updateProfile('search_history', JSON.stringify(history)).catch(() => {})
      
      // Track preferred sources
      const sourcesStr = profile['preferred_sources']?.value || '{}'
      let sources: Record<string, number> = {}
      if (typeof sourcesStr === 'string') {
        try { sources = JSON.parse(sourcesStr) } catch { }
      }
      sources[source] = (sources[source] || 0) + 1
      this.memoryManager.updateProfile('preferred_sources', JSON.stringify(sources)).catch(() => {})

    } catch (e) {
      console.warn(`[RETRIEVAL] Failed to record search memory: ${e}`)
    }
  }
}
