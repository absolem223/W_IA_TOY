// ── Memory System — Working Memory (Layer 1) ─────────────────
// In-memory session turns. Volatile by design.
// Persisted to disk ONLY for crash recovery (not as source of truth).

import { join } from 'path'
import type { ChatMessage, TimestampedTurn, WorkingMemoryData, LogFn } from './types'
import { DEFAULT_WORKING, MEMORY_LIMITS } from './constants'
import { writeAtomic, readSafe } from './atomicFs'

export class WorkingMemory {
  private data: WorkingMemoryData
  private filePath: string
  private log: LogFn

  constructor(baseDir: string, log: LogFn) {
    this.filePath = join(baseDir, 'working', 'session.json')
    this.log = log
    this.data = {
      ...DEFAULT_WORKING,
      sessionId: `sess_${Date.now()}`,
      startedAt: new Date().toISOString(),
    }
  }

  /** Load previous session data (crash recovery only). */
  async load(): Promise<void> {
    const saved = await readSafe<WorkingMemoryData>(this.filePath, DEFAULT_WORKING, this.log)
    if (saved.sessionId && saved.turns.length > 0) {
      this.log(`[MEMORY] Recovered ${saved.turns.length} turns from previous session.`)
      // Start a new session but carry over the recovered turns
      this.data.turns = saved.turns.slice(-MEMORY_LIMITS.WORKING_MAX_TURNS)
      this.data.turnCount = this.data.turns.length
    }
  }

  /** Append a chat message as a timestamped turn. */
  appendTurn(msg: ChatMessage): void {
    const turn: TimestampedTurn = { ...msg, ts: Date.now() }
    this.data.turns.push(turn)
    this.data.turnCount++

    // Trim to max window size
    if (this.data.turns.length > MEMORY_LIMITS.WORKING_MAX_TURNS) {
      this.data.turns = this.data.turns.slice(-MEMORY_LIMITS.WORKING_MAX_TURNS)
    }
  }

  /** Get all turns in the current working window. */
  getTurns(): TimestampedTurn[] {
    return this.data.turns
  }

  /** Get the current turn count (total, not just window). */
  getTurnCount(): number {
    return this.data.turnCount
  }

  /** Get turns since last reflection. */
  getTurnsSinceReflection(): number {
    return this.data.turnCount - this.data.lastReflectionAtTurn
  }

  /** Mark that reflection happened at this turn. */
  markReflection(): void {
    this.data.lastReflectionAtTurn = this.data.turnCount
  }

  /** Flush current state to disk (for crash recovery). */
  async flush(): Promise<void> {
    await writeAtomic(this.filePath, this.data)
  }

  /** Clear all turns (used during migration or reset). */
  clear(): void {
    this.data.turns = []
    this.data.turnCount = 0
    this.data.activeTopics = []
    this.data.reflectionScore = 0
    this.data.lastReflectionAtTurn = 0
  }

  /** Bulk-load turns (used during migration). */
  loadTurns(messages: ChatMessage[]): void {
    const trimmed = messages.slice(-MEMORY_LIMITS.WORKING_MAX_TURNS)
    this.data.turns = trimmed.map(m => ({ ...m, ts: Date.now() }))
    this.data.turnCount = trimmed.length
  }
}
