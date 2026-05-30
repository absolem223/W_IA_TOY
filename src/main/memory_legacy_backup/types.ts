// ── Memory System — Type Definitions ─────────────────────────
// Shared across all memory modules. No runtime logic here.

import type { ChatMessage } from '../../shared/types'

export type { ChatMessage }

// ── Primitives ──

export type MemorySource = 'explicit' | 'inferred' | 'reflection'
export type Confidence = 'high' | 'medium' | 'low'
export type LogFn = (...args: unknown[]) => void

// ── Working Memory (Layer 1 — RAM) ──

export interface TimestampedTurn extends ChatMessage {
  ts: number
}

export interface WorkingMemoryData {
  version: number
  sessionId: string
  startedAt: string
  turnCount: number
  turns: TimestampedTurn[]
  activeTopics: string[]
  reflectionScore: number
  lastReflectionAtTurn: number
}

// ── Episodic Memory (Layer 2 — JSON file) ──

export interface Episode {
  id: string
  date: string
  turnRange: [number, number]
  summary: string
  keyDecisions: string[]
  topics: string[]
  createdAt: string
}

export interface EpisodicMemoryData {
  version: number
  episodes: Episode[]
}

// ── Semantic Memory (Layer 3 — JSON file) ──

export interface ProfileEntry {
  value: string | string[]
  confidence: Confidence
  source: MemorySource
  createdAt: string
  updatedAt: string
}

export interface PatternEntry {
  id: string
  label: string
  mentions: number
  confidence: Confidence
  source: MemorySource
  createdAt: string
  lastSeen: string
}

export interface TechStack {
  languages: string[]
  frameworks: string[]
  runtime: string[]
  tools: string[]
  updatedAt: string
}

export interface AssistantProfile {
  assistant_name: string
  assistant_role: string
  speaking_style: string
  emotional_tone: string
  preferred_relationship: string
}

export interface SemanticMemoryData {
  version: number
  profile: Record<string, ProfileEntry>
  patterns: PatternEntry[]
  stack: TechStack
  assistant: AssistantProfile
}

// ── Vault Memory (Layer 4 — index.json + .md files) ──

export interface VaultIndexEntry {
  id: string
  filename: string
  title: string
  tags: string[]
  trigger: 'explicit' | 'detected-intent'
  createdAt: string
}

export interface VaultIndex {
  version: number
  entries: VaultIndexEntry[]
}

// ── IPC Payloads ──

export interface SaveExplicitPayload {
  title: string
  content: string
  tags: string[]
}

export interface SaveExplicitResult {
  id: string
  filename: string
}

export interface ProfileUpdatePayload {
  key: string
  value: string | string[]
}

export interface MigrationPayload {
  messages: ChatMessage[]
}

export interface MigrationResult {
  success: boolean
  turnsMigrated: number
}

export interface MemoryStatus {
  initialized: boolean
  migrated: boolean
  turnCount: number
  vaultCount: number
  profileKeys: number
}

// ── Config ──

export interface MemoryConfig {
  version: number
  migrated: boolean
  migrationOffered: boolean
  reflection: {
    minTurns: number
    maxTurns: number
    maxPerDay: number
    todayCount: number
    todayDate: string
  }
  lastReflection: string | null
  createdAt: string
}
