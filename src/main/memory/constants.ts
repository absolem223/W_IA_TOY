// ── Memory System — Constants & Governance Rules ─────────────
// Hard-coded security rules that cannot be bypassed by editing files.

import type { MemoryConfig, WorkingMemoryData, SemanticMemoryData, EpisodicMemoryData, VaultIndex } from './types'

// ── PROHIBITED PATTERNS (hard-coded, never configurable) ──

export const PROHIBITED_PATTERNS: RegExp[] = [
  // API keys & tokens
  /\b(sk-[a-zA-Z0-9_-]{20,})\b/,
  /\b(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/i,
  /\b(bearer\s+[a-zA-Z0-9_.-]+)\b/i,

  // Platform-specific secrets
  /\b(ghp_[a-zA-Z0-9]{36,})\b/,               // GitHub PAT
  /\b(sk-or-v1-[a-zA-Z0-9]{40,})\b/,           // OpenRouter
  /\b(AKIA[A-Z0-9]{16})\b/,                     // AWS access key

  // Credit card numbers (basic pattern)
  /\b[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/,
]

// ── MEMORY LIMITS ──

export const MEMORY_LIMITS = {
  WORKING_MAX_TURNS: 40,
  EPISODIC_MAX_ENTRIES: 200,
  VAULT_WARN_THRESHOLD: 500,
  PREAMBLE_MAX_TOKENS: 400,
  REFLECTION_MIN_TURNS: 8,
  REFLECTION_MAX_TURNS: 20,
  REFLECTION_MAX_PER_DAY: 20,
  REFLECTION_COOLDOWN_MS: 2 * 60 * 1000,
  PROFILE_MAX_UPDATES_PER_REFLECTION: 3,

  // Crash-safe flush
  FLUSH_INTERVAL_MS: 15_000,           // 15 seconds between flushes
  FLUSH_MIN_TURNS_DELTA: 2,            // minimum new turns before flushing

  // Retrieval & prompt injection
  RETRIEVAL_MAX_SNIPPETS: 5,
  RETRIEVAL_MAX_CHARS: 800,
} as const

// ── DEFAULT FILE CONTENTS (generated on first boot) ──

export const DEFAULT_CONFIG: MemoryConfig = {
  version: 2,
  migrated: false,
  migrationOffered: false,
  reflection: {
    minTurns: MEMORY_LIMITS.REFLECTION_MIN_TURNS,
    maxTurns: MEMORY_LIMITS.REFLECTION_MAX_TURNS,
    maxPerDay: MEMORY_LIMITS.REFLECTION_MAX_PER_DAY,
    todayCount: 0,
    todayDate: '',
  },
  lastReflection: null,
  createdAt: '',
}

export const DEFAULT_WORKING: WorkingMemoryData = {
  version: 1,
  sessionId: '',
  startedAt: '',
  turnCount: 0,
  turns: [],
  activeTopics: [],
  reflectionScore: 0,
  lastReflectionAtTurn: 0,
}

export const DEFAULT_SEMANTIC: SemanticMemoryData = {
  version: 1,
  profile: {},
  patterns: [],
  stack: {
    languages: [],
    frameworks: [],
    runtime: [],
    tools: [],
    updatedAt: '',
  },
  assistant: {
    assistant_name: 'ArgOS',
    assistant_role: 'compañero',
    speaking_style: 'directa',
    emotional_tone: 'cálido',
    preferred_relationship: 'amigable'
  }
}

export const DEFAULT_EPISODIC: EpisodicMemoryData = {
  version: 1,
  episodes: [],
}

export const DEFAULT_VAULT_INDEX: VaultIndex = {
  version: 1,
  entries: [],
}

// ── GOVERNANCE DOCUMENT (generated once, user-editable for soft rules) ──

export const MEMORY_RULES_MD = `# Memory Governance Rules

## ALLOWED — auto-persist
- User name, preferred language, communication tone
- Technical stack, frameworks, tools
- Active projects and their architecture decisions
- Recurring concepts mentioned 3+ times
- Conversation summaries (episodic)

## REQUIRES CONFIRMATION — candidate queue
- Inferred preferences (confidence < high)
- Behavioral patterns detected by reflection
- Candidate vault entries from reflection

## PROHIBITED — never persist (enforced by code)
- Passwords, API keys, tokens, secrets
- Financial information (card numbers, balances)
- Health or medical data
- Content the user explicitly asked to forget
- Raw conversation logs beyond working memory window

## RETENTION
- Episodic: max 200 entries, oldest archived after 90 days
- Semantic: entries archived (not deleted) if unused 60 days
- Vault: never auto-deleted, never auto-modified
- Working: destroyed on session end
`
