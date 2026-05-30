// ── Memory System — Retrieval (Phase 0) ──────────────────────
// Simple keyword-based retrieval. No embeddings, no vector DB, no AI.
// Scores memory entries by keyword overlap, recency, and confidence.

import type { SemanticMemoryData, VaultIndexEntry, EpisodicMemoryData, ProfileEntry, LogFn } from './types'
import { MEMORY_LIMITS } from './constants'

export interface RetrievalSnippet {
  source: 'profile' | 'vault' | 'episodic'
  label: string
  content: string
  score: number
}

export interface MemoryUsedItem {
  type: string
  label: string
  score: number
}

export interface MemoryPreambleResult {
  preamble: string
  usedMemories: MemoryUsedItem[]
}

// ── Stopwords (bilingual, minimal set) ──
const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'que', 'es', 'y', 'a', 'por', 'con', 'no', 'se', 'para',
  'the', 'a', 'an', 'in', 'on', 'of', 'to', 'and', 'is', 'it', 'for', 'with', 'not', 'as', 'at', 'by', 'or',
  'como', 'qué', 'más', 'pero', 'muy', 'sin', 'sobre', 'todo', 'esta', 'hay',
  'can', 'will', 'just', 'how', 'what', 'this', 'that', 'are', 'was', 'been', 'have', 'has',
])

/** Extract meaningful keywords from text. */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-záéíóúüñ0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
}

/** Count keyword matches between query keywords and target text. */
function keywordOverlap(queryKeywords: string[], targetText: string): number {
  const targetLower = targetText.toLowerCase()
  return queryKeywords.filter(kw => targetLower.includes(kw)).length
}

/** Recency boost: 1.0 for today, decays to 0.5 over 30 days. */
function recencyBoost(isoDate: string): number {
  const ageMs = Date.now() - new Date(isoDate).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  return Math.max(0.5, 1.0 - (ageDays / 60))
}

/** Confidence weight: high=1.0, medium=0.7, low=0.4. */
function confidenceWeight(conf: string): number {
  if (conf === 'high') return 1.0
  if (conf === 'medium') return 0.7
  return 0.4
}

// ── Telemetry counters (in-memory, reset on restart) ──
const telemetry = {
  totalQueries: 0,
  totalHits: 0,
  totalMisses: 0,
  totalDeduped: 0,
  totalCapped: 0,
  totalSnippetsUsed: 0,
}

/** Get current telemetry stats. */
export function getRetrievalTelemetry(): typeof telemetry {
  return { ...telemetry }
}

/**
 * Retrieve relevant memory snippets for a query string.
 * Returns scored, deduplicated, and capped results.
 */
export function retrieveRelevant(
  query: string,
  semantic: SemanticMemoryData,
  vaultEntries: VaultIndexEntry[],
  episodic: EpisodicMemoryData,
  log?: LogFn,
): RetrievalSnippet[] {
  const keywords = extractKeywords(query)
  telemetry.totalQueries++

  if (keywords.length === 0) {
    telemetry.totalMisses++
    log?.(`[MEMORY_RETRIEVAL] No keywords extracted from query`)
    return []
  }

  log?.(`[MEMORY_RETRIEVAL] keywords=[${keywords.join(', ')}]`)

  const allCandidates: RetrievalSnippet[] = []
  let profileHits = 0, vaultHits = 0, episodicHits = 0

  // ── Profile entries ──
  for (const [key, entry] of Object.entries(semantic.profile)) {
    // Skip deprecated entries — they must not reach LLM context through any path
    if (key.startsWith('deprecated__')) continue
    const valueStr = Array.isArray(entry.value) ? entry.value.join(', ') : entry.value
    const overlap = keywordOverlap(keywords, `${key} ${valueStr}`)
    if (overlap > 0) {
      profileHits++
      allCandidates.push({
        source: 'profile',
        label: key.replace(/_/g, ' '),
        content: valueStr,
        score: overlap * confidenceWeight((entry as ProfileEntry).confidence) * 2,
      })
    }
  }

  // ── Vault entries (title + tags only) ──
  for (const entry of vaultEntries) {
    const searchable = `${entry.title} ${entry.tags.join(' ')}`
    const overlap = keywordOverlap(keywords, searchable)
    if (overlap > 0) {
      vaultHits++
      allCandidates.push({
        source: 'vault',
        label: entry.title,
        content: `[${entry.tags.join(', ')}]`,
        score: overlap * recencyBoost(entry.createdAt) * 1.5,
      })
    }
  }

  // ── Recent episodes ──
  const recentEpisodes = (episodic.episodes || []).slice(-5)
  for (const ep of recentEpisodes) {
    const searchable = `${ep.summary} ${ep.topics.join(' ')} ${ep.keyDecisions.join(' ')}`
    const overlap = keywordOverlap(keywords, searchable)
    if (overlap > 0) {
      episodicHits++
      allCandidates.push({
        source: 'episodic',
        label: `Session ${ep.date}`,
        content: ep.summary,
        score: overlap * recencyBoost(ep.createdAt),
      })
    }
  }

  // Sort, dedupe, cap
  const sorted = allCandidates.sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const deduped: RetrievalSnippet[] = []
  let dedupedCount = 0

  for (const s of sorted) {
    const key = `${s.source}:${s.label}`
    if (seen.has(key)) { dedupedCount++; continue }
    seen.add(key)
    deduped.push(s)
  }

  const capped = deduped.slice(0, MEMORY_LIMITS.RETRIEVAL_MAX_SNIPPETS)
  const cappedCount = deduped.length - capped.length

  // Update telemetry
  telemetry.totalDeduped += dedupedCount
  telemetry.totalCapped += cappedCount
  telemetry.totalSnippetsUsed += capped.length
  if (capped.length > 0) telemetry.totalHits++
  else telemetry.totalMisses++

  log?.(`[MEMORY_RETRIEVAL] ${profileHits}P + ${vaultHits}V + ${episodicHits}E hits, ${dedupedCount} deduped, ${cappedCount} capped → ${capped.length} used`)
  for (const s of capped) {
    log?.(`[MEMORY_RETRIEVAL_SCORE] [${s.source}] ${s.label}: score=${s.score.toFixed(2)} | Overlap/Recency`)
  }

  return capped
}

/**
 * Build the profile section of the memory preamble.
 * Always included (small and high-value).
 */
export function buildAssistantIdentity(semantic: SemanticMemoryData): string {
  if (!semantic.assistant) return ''
  const lines = Object.entries(semantic.assistant)
    .map(([key, val]) => `${key}=${val}`)
  return `<assistant_identity>\n${lines.join('\n')}\n</assistant_identity>`
}

/**
 * Build the profile section of the memory preamble.
 * Always included (small and high-value).
 * Filters out deprecated__ entries — they are preserved on disk for audit
 * but must never reach the LLM context.
 */
export function buildProfileSummary(semantic: SemanticMemoryData): string {
  const entries = Object.entries(semantic.profile)
  if (entries.length === 0) return ''

  const lines = entries
    .filter(([key, e]) => {
      // Exclude deprecated entries (reconciliation artifacts)
      if (key.startsWith('deprecated__')) return false
      // Exclude low-confidence entries
      return (e as ProfileEntry).confidence !== 'low'
    })
    .map(([key, entry]) => {
      const val = Array.isArray(entry.value) ? entry.value.join(', ') : entry.value
      return `- ${key.replace(/_/g, ' ')}: ${val}`
    })

  if (lines.length === 0) return ''
  return `<user_profile>\n${lines.join('\n')}\n</user_profile>`
}

/**
 * Assemble the complete memory preamble for prompt injection.
 * Returns both the preamble string and structured metadata.
 */
export function assembleMemoryPreamble(
  semantic: SemanticMemoryData,
  vaultEntries: VaultIndexEntry[],
  currentInput: string,
  cognitive?: any,
  episodic?: EpisodicMemoryData,
  log?: LogFn,
): MemoryPreambleResult {
  const parts: string[] = []
  const usedMemories: MemoryUsedItem[] = []
  let totalChars = 0
  const maxChars = MEMORY_LIMITS.RETRIEVAL_MAX_CHARS

  // 1. Assistant Identity
  const assistantId = buildAssistantIdentity(semantic)
  if (assistantId) {
    parts.push(assistantId)
    totalChars += assistantId.length
  }

  // 2. Profile (always included, small)
  const profile = buildProfileSummary(semantic)
  if (profile && totalChars + profile.length < maxChars) {
    parts.push(profile)
    totalChars += profile.length
    // Add profile entries to metadata
    for (const [key, entry] of Object.entries(semantic.profile)) {
      if ((entry as ProfileEntry).confidence === 'low') continue
      usedMemories.push({ type: 'profile', label: key.replace(/_/g, ' '), score: 1 })
    }
    log?.(`[MEMORY_PROFILE_INJECTION] Injected ${Object.keys(semantic.profile).length} profile keys (${profile.length} chars)`)
  }

  // 3. Relevant snippets from retrieval
  const snippets = retrieveRelevant(currentInput, semantic, vaultEntries, episodic || { turns: [] }, log)
  if (snippets.length > 0) {
    const snippetLines: string[] = []
    for (const s of snippets) {
      if (s.source === 'profile') continue // already included above
      const line = `- [${s.source}] ${s.label}: ${s.content}`
      if (totalChars + line.length > maxChars) {
        log?.(`[MEMORY_TRUNCATION] Skipped "${s.label}" (Hit character cap: ${totalChars}/${maxChars})`)
        break
      }
      snippetLines.push(line)
      totalChars += line.length
      usedMemories.push({ type: s.source, label: s.label, score: Math.round(s.score * 100) / 100 })
    }
    if (snippetLines.length > 0) {
      parts.push(`<relevant_memories>\n${snippetLines.join('\n')}\n</relevant_memories>`)
    }
  }

  // 3. Cognitive Context (Active Task / Recent Intents)
  if (cognitive) {
    const activeTask = cognitive.getActiveTopic()
    const intents = cognitive.getRecentIntents()
    if (activeTask || intents.length > 0) {
      let cogPart = `<attention_state>\n`
      if (activeTask) cogPart += `- Foco Actual (Active Topic): ${activeTask}\n`
      if (intents.length > 0) {
        cogPart += `- Historial Reciente (Últimos ${intents.length} intents):\n`
        intents.forEach((int: string) => cogPart += `  * ${int}\n`)
      }
      cogPart += `</attention_state>`
      parts.push(cogPart)
      totalChars += cogPart.length
    }
  }

  const preamble = parts.length > 0 ? parts.join('\n\n') : ''
  log?.(`[MEMORY] Preamble assembled: ${preamble.length} chars, ${usedMemories.length} memories used`)

  return { preamble, usedMemories }
}

