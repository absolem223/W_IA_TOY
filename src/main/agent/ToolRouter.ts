/**
 * ToolRouter — Intelligent tool selector for the AgentExecutor.
 *
 * Instead of blindly forwarding ALL registered tools to the LLM on every
 * request, ToolRouter analyses the user query and returns only the most
 * relevant subset.  This reduces prompt token consumption, lowers latency
 * and (on smaller/local models) greatly improves tool-call accuracy.
 *
 * Algorithm (fully self-contained — zero external dependencies):
 *  1. Tokenise the query into meaningful keywords (stop-words removed).
 *  2. For each tool, build a keyword set from its name + description.
 *  3. Score each tool as the intersection size of query ∩ tool keywords.
 *  4. Return the top-N tools by score; fall back to the first 3 if no
 *     tool scores above zero.
 */

import type { ToolRegistry } from '../tools/ToolRegistry'
import type { LLMManager } from '../services/llm/LLMManager'

// ---------------------------------------------------------------------------
// Stop-words (English + Spanish — the two languages used by ArgOS)
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  // English
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'can', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my',
  'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'what', 'which',
  'who', 'whom', 'how', 'when', 'where', 'why', 'all', 'each', 'every',
  'some', 'any', 'no', 'not', 'so', 'if', 'then', 'than', 'too', 'very',
  'just', 'also', 'there', 'their', 'use', 'using', 'used', 'get', 'give',
  'make', 'let', 'see', 'want', 'need', 'tell', 'know', 'think', 'say',

  // Spanish
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al',
  'en', 'con', 'por', 'para', 'que', 'se', 'es', 'son', 'fue', 'era', 'si',
  'no', 'ya', 'le', 'lo', 'me', 'mi', 'su', 'sus', 'este', 'esta', 'esto',
  'ese', 'esa', 'eso', 'como', 'más', 'mas', 'muy', 'tan', 'bien', 'mal',
  'hay', 'pero', 'y', 'o', 'e', 'ni', 'pues', 'aunque', 'cuando', 'donde',
  'quien', 'cuál', 'cual', 'qué', 'quiero', 'quieres', 'tengo', 'tiene',
  'hacer', 'hacer', 'dame', 'dime', 'muéstrame', 'puedes', 'puedo',
])

// ---------------------------------------------------------------------------
// Domain → keyword boosting table
// Maps semantic domain labels to extra keywords injected into tool scoring.
// This lets the router recognise intent even when the query doesn't literally
// contain a word in the tool description.
// ---------------------------------------------------------------------------
const DOMAIN_ALIASES: Record<string, string[]> = {
  filesystem: [
    'archivo', 'archivos', 'carpeta', 'carpetas', 'directorio', 'file', 'files',
    'folder', 'directory', 'lista', 'listar', 'mostrar', 'descargas', 'downloads',
    'path', 'ruta', 'leer', 'escribir', 'crear', 'borrar', 'mover', 'copiar',
    'read', 'write', 'create', 'delete', 'move', 'copy', 'open', 'save',
  ],
  search: [
    'busca', 'buscar', 'búsqueda', 'search', 'web', 'internet', 'google',
    'información', 'info', 'noticias', 'news', 'clima', 'weather', 'find',
    'lookup', 'query', 'consulta',
  ],
  voice: [
    'voz', 'voice', 'hablar', 'speak', 'escuchar', 'listen', 'stt', 'tts',
    'transcribir', 'transcribe', 'dictado', 'dictate', 'audio', 'micrófono',
    'microphone', 'reconocimiento', 'recognition', 'speech',
  ],
  memory: [
    'recuerda', 'recuerdo', 'recordar', 'remember', 'memoria', 'memory',
    'perfil', 'profile', 'guardar', 'save', 'preferencia', 'preference',
    'identidad', 'identity', 'nombre', 'name',
  ],
  multimedia: [
    'imagen', 'image', 'foto', 'photo', 'video', 'youtube', 'media',
    'multimedia', 'procesar', 'process', 'analizar', 'analyse', 'analyze',
    'ver', 'watch', 'screenshot', 'captura',
  ],
  knowledge: [
    'conocimiento', 'knowledge', 'aprende', 'learn', 'fuente', 'source',
    'documento', 'document', 'base', 'datos', 'database',
  ],
}

// ---------------------------------------------------------------------------
// Helper: tokenise a string → Set<string> (lowercase, stop-word filtered)
// ---------------------------------------------------------------------------
function tokenise(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\sáéíóúüñàèìòùâêîôûçäëïöü'-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))

  return new Set(tokens)
}

// ---------------------------------------------------------------------------
// Helper: build keyword set for a single tool definition
// ---------------------------------------------------------------------------
function buildToolKeywords(toolDef: any): Set<string> {
  const fn = toolDef.function ?? toolDef
  const text = [
    fn.name ?? '',
    fn.description ?? '',
    // Also include parameter names & descriptions for richer matching
    ...Object.entries(fn.parameters?.properties ?? {}).map(
      ([k, v]: [string, any]) => `${k} ${v?.description ?? ''}`
    ),
    // Include capability/permission scopes as signals
    ...(fn.capabilities ?? []),
  ].join(' ')

  const keywords = tokenise(text)

  // Inject domain aliases: if any alias keyword matches the tool's raw text,
  // add the entire domain alias list to enrich the keyword set.
  const rawText = text.toLowerCase()
  for (const [_domain, aliases] of Object.entries(DOMAIN_ALIASES)) {
    if (aliases.some(alias => rawText.includes(alias))) {
      for (const alias of aliases) {
        if (alias.length > 2 && !STOP_WORDS.has(alias)) {
          keywords.add(alias)
        }
      }
    }
  }

  return keywords
}

// ---------------------------------------------------------------------------
// Helper: Jaccard-like overlap score between two keyword sets
//   score = |A ∩ B| / (1 + |A|)   — normalised so larger tools don't dominate
// ---------------------------------------------------------------------------
function overlapScore(queryKws: Set<string>, toolKws: Set<string>): number {
  let intersection = 0
  for (const kw of queryKws) {
    if (toolKws.has(kw)) intersection++
  }
  // Partial substring bonus: catch e.g. "filesystem" matching "file"
  for (const qk of queryKws) {
    for (const tk of toolKws) {
      if (tk !== qk && (tk.includes(qk) || qk.includes(tk))) {
        intersection += 0.5
        break
      }
    }
  }
  return intersection / (1 + queryKws.size)
}

// ---------------------------------------------------------------------------
// ToolRouter
// ---------------------------------------------------------------------------
export class ToolRouter {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    // llmManager is accepted for API compatibility but not used in the
    // keyword-matching strategy (no embedding calls needed).
    private readonly llmManager: LLMManager,
    private readonly logger?: { log: (...args: any[]) => void }
  ) {}

  /**
   * Select the most relevant tools for a given user query.
   *
   * @param userQuery  The raw user message text.
   * @param allTools   The full list of tool definitions from ToolRegistry.
   * @param maxResults Maximum number of tools to return (default 4).
   * @returns          A filtered, ordered subset of allTools.
   */
  selectTools(userQuery: string, allTools: any[], maxResults = 4): any[] {
    if (allTools.length === 0) return []

    // 1. Build query keyword set, enriching with domain aliases
    const rawQueryKws = tokenise(userQuery)
    const queryKws = new Set(rawQueryKws)

    // Inject domain aliases triggered by query words
    const lowerQuery = userQuery.toLowerCase()
    for (const [_domain, aliases] of Object.entries(DOMAIN_ALIASES)) {
      if (aliases.some(alias => lowerQuery.includes(alias))) {
        for (const alias of aliases) {
          if (alias.length > 2 && !STOP_WORDS.has(alias)) {
            queryKws.add(alias)
          }
        }
      }
    }

    // 2. Score every tool
    const scored = allTools.map(tool => ({
      tool,
      score: overlapScore(queryKws, buildToolKeywords(tool)),
    }))

    // 3. Sort descending by score
    scored.sort((a, b) => b.score - a.score)

    this.logger?.log(
      `[TOOL_ROUTER] Query="${userQuery.substring(0, 60)}" ` +
      `queryKws=[${[...queryKws].join(', ')}] ` +
      `top3=${scored.slice(0, 3).map(s => `${s.tool.function?.name ?? '?'}(${s.score.toFixed(2)})`).join(', ')}`
    )

    // 4. Return top-N or fallback
    const hasMatches = scored[0]?.score > 0
    if (!hasMatches) {
      // Fallback: return first 3 tools (likely the most generic / always-needed)
      this.logger?.log(`[TOOL_ROUTER] No keyword matches — using fallback (first 3 tools)`)
      return allTools.slice(0, 3)
    }

    return scored.slice(0, maxResults).map(s => s.tool)
  }
}
