import type { ToolRegistry } from './ToolRegistry'
import { globalRetrievalOrchestrator } from '../knowledge/RetrievalStrategy'
import { globalKnowledgeStore } from '../knowledge/KnowledgeStore'
import { globalMemoryConsolidator } from '../knowledge/MemoryConsolidator'
import { globalCognitiveSession } from '../knowledge/CognitiveSessionManager'

export function registerKnowledgeTools(registry: ToolRegistry) {
  registry.register(
  {
    name: 'query_knowledge',
    description: "Search your internal persistent knowledge base (which includes ingested videos, documents, and past conversations) using lexical or exact search.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The text to search for" },
        strategy: { type: "string", description: "The retrieval strategy: 'lexical' or 'exact'" },
        sourceOrigin: { type: "string", description: "Optional filter by source origin, e.g. 'youtube', 'user_chat'" },
        limit: { type: "number", description: "Max results to return (default: 5)" }
      },
      required: ["query", "strategy"],
      additionalProperties: false
    },
    capabilities: ['memory:read'],
    requiresApproval: false,
    isTrusted: true
  },
  async (args, ctx: any) => {
    try {
      const results = await globalRetrievalOrchestrator.retrieve(args.strategy as any, args.query, {
        sourceOrigin: args.sourceOrigin,
        limit: args.limit || 5
      })

      // Convert KnowledgeNode to a simplified JSON for the LLM
      const simplified = results.map(r => ({
        id: r.id,
        content: r.content,
        metadata: r.metadata,
        source: r.provenance.sourceOrigin,
        trustScore: r.trustScore
      }))

      return { success: true, count: results.length, data: simplified }
    } catch (e: any) {
      return { success: false, error: `Knowledge query failed: ${e.message}` }
    }
  }
)

  registry.register(
  {
    name: 'inspect_knowledge_node',
    description: "Inspect the raw database details of a specific knowledge node, including its provenance, trust score, usage score, and graph relationships. Use this to audit retrieval quality.",
    parameters: {
      type: "object",
      properties: {
        node_id: { type: "string", description: "The ID of the node to inspect" }
      },
      required: ["node_id"],
      additionalProperties: false
    },
    capabilities: ['memory:read'],
    requiresApproval: false,
    isTrusted: true
  },
  async (args, ctx: any) => {
    try {
      const db = (globalKnowledgeStore as any).db
      const node = db.prepare(`SELECT * FROM nodes WHERE id = ?`).get(args.node_id)
      if (!node) return { success: false, error: "Node not found." }
      
      const provenance = db.prepare(`SELECT * FROM provenance WHERE node_id = ?`).get(args.node_id)
      const edges = db.prepare(`SELECT * FROM edges WHERE source_id = ? OR target_id = ?`).all(args.node_id, args.node_id)

      return {
        success: true,
        data: {
          node: { ...node, metadata: JSON.parse(node.metadata) },
          provenance,
          edges
        }
      }
    } catch (e: any) {
      return { success: false, error: `Inspection failed: ${e.message}` }
    }
  }
)

  registry.register(
  {
    name: 'consolidate_memory',
    description: "Trigger the Memory Consolidation cycle manually. This will clean up expired nodes, archive stale data, merge exact duplicates, and apply decay to usage scores. Helps prevent infinite growth.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    capabilities: ['memory:write'],
    requiresApproval: false,
    isTrusted: true
  },
  async (args, ctx: any) => {
    try {
      globalMemoryConsolidator.runConsolidationCycle()
      return { success: true, message: "Memory consolidation cycle completed successfully." }
    } catch (e: any) {
      return { success: false, error: `Consolidation failed: ${e.message}` }
    }
  }
)

  registry.register(
  {
    name: 'set_cognitive_session',
    description: "Switch your current cognitive session type to alter retrieval weights and context assembly. Valid types: 'research' (explores concepts), 'coding' (strict precision), 'creative' (wide exploration), 'planning' (recent tasks), 'general'.",
    parameters: {
      type: "object",
      properties: {
        sessionType: { type: "string", description: "The session type: research, coding, creative, planning, general" }
      },
      required: ["sessionType"],
      additionalProperties: false
    },
    capabilities: ['memory:write'],
    requiresApproval: false,
    isTrusted: true
  },
  async (args, ctx: any) => {
    try {
      if (!['research', 'coding', 'creative', 'planning', 'general'].includes(args.sessionType)) {
        return { success: false, error: "Invalid session type." }
      }
      globalCognitiveSession.setSessionType(args.sessionType as any)
      return { success: true, message: `Cognitive session set to ${args.sessionType}. Retrieval algorithms have been adjusted.` }
    } catch (e: any) {
      return { success: false, error: `Failed to set session: ${e.message}` }
    }
  }
)

  registry.register(
  {
    name: 'update_intent',
    description: "Persist your current long-term goals and cognitive focus. This helps the system track what you are working on over days/weeks.",
    parameters: {
      type: "object",
      properties: {
        currentFocus: { type: "string", description: "A short sentence describing your immediate focus." },
        activeObjectives: { type: "array", items: { type: "string" }, description: "List of open goals/threads." }
      },
      required: ["currentFocus", "activeObjectives"],
      additionalProperties: false
    },
    capabilities: ['memory:write'],
    requiresApproval: false,
    isTrusted: true
  },
  async (args, ctx: any) => {
    try {
      globalCognitiveSession.updateIntent(args.currentFocus, args.activeObjectives)
      return { success: true, message: "Intent state persisted." }
    } catch (e: any) {
      return { success: false, error: `Failed to update intent: ${e.message}` }
    }
  }
)

  registry.register(
  {
    name: 'ping_tool',
    description: "Minimal diagnostic tool. Use this to verify that your tool calling pipeline is working.",
    parameters: {
      type: "object",
      properties: {
        echo: { type: "string", description: "Any string to echo back" }
      },
      required: ["echo"],
      additionalProperties: false
    },
    capabilities: [],
    requiresApproval: false,
    isTrusted: true
  },
  async (args, ctx: any) => {
    console.log(`[TOOLS] ping_tool called with echo: ${args.echo}`)
    return { success: true, message: `Ping received. Echo: ${args.echo}` }
  }
)
}
