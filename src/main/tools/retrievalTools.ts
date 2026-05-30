import type { ToolRegistry } from './ToolRegistry'
import type { RetrievalOrchestrator } from '../retrieval/RetrievalOrchestrator'

export interface RetrievalToolContext {
  retrievalOrchestrator?: RetrievalOrchestrator
}

export function registerRetrievalTools(registry: ToolRegistry) {
  registry.register(
  {
    name: 'google_web_search',
    description: "Search the web using Google Search. Use this to find recent information, news, or factual answers that you don't know.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        max_results: { type: "number", description: "Maximum number of results to return (default: 5)" }
      },
      required: ["query"],
      additionalProperties: false
    },
    capabilities: ['search.web'],
    requiresApproval: false, // Read-only public search usually doesn't need explicit approval if trusted context
    isTrusted: true
  },
  async (args, ctx: any) => {
    if (!ctx.retrievalOrchestrator) {
      return { success: false, error: 'Retrieval Orchestrator not available.' }
    }
    
    try {
      const results = await ctx.retrievalOrchestrator.searchWeb(args.query, args.max_results || 5)
      return { success: true, data: results }
    } catch (e: any) {
      return { success: false, error: `Web search failed: ${e.message}` }
    }
  }
  )

  registry.register(
  {
    name: 'youtube_search',
    description: "Search YouTube for videos, channels, or playlists. Use this when the user asks for videos.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query for YouTube" },
        account_id: { type: "string", description: "Optional. The user's Google account email to perform authenticated search." },
        max_results: { type: "number", description: "Maximum number of videos to return (default: 5)" }
      },
      required: ["query"],
      additionalProperties: false
    },
    capabilities: ['youtube.readonly'],
    requiresApproval: true, // Searching YT with OAuth requires approval (privacy)
    isTrusted: true
  },
  async (args, ctx: any) => {
    if (!ctx.retrievalOrchestrator) {
      return { success: false, error: 'Retrieval Orchestrator not available.' }
    }
    
    try {
      const results = await ctx.retrievalOrchestrator.searchYouTube(args.query, args.account_id, args.max_results || 5)
      return { success: true, data: results }
    } catch (e: any) {
      return { success: false, error: `YouTube search failed: ${e.message}` }
    }
  }
)
}
