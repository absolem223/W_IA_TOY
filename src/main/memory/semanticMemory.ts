// ── Memory System — Semantic Memory (Layer 3) ────────────────
// Persistent user profile, patterns, and tech stack.
// Slow-changing, high-value information.

import { join } from 'path'
import type { SemanticMemoryData, ProfileEntry, Confidence, MemorySource, LogFn, AssistantProfile } from './types'
import { DEFAULT_SEMANTIC } from './constants'
import { writeAtomic, readSafe } from './atomicFs'
import { checkContent } from './governance'

import { DEFAULT_ASSISTANT_PROFILE } from './identityLayer'

export class SemanticMemory {
  private data: SemanticMemoryData
  private filePath: string
  private log: LogFn
  private history: SemanticMemoryData[] = []
  private saveTimeout: NodeJS.Timeout | null = null
  private readonly MAX_HISTORY = 5

  constructor(baseDir: string, log: LogFn) {
    this.filePath = join(baseDir, 'semantic', 'semantic.json')
    this.log = log
    this.data = { 
      ...DEFAULT_SEMANTIC, 
      profile: {}, 
      patterns: [], 
      stack: { ...DEFAULT_SEMANTIC.stack },
      assistant: { ...DEFAULT_ASSISTANT_PROFILE }
    }
  }

  /** Load semantic memory from disk. */
  async load(): Promise<void> {
    this.data = await readSafe<SemanticMemoryData>(this.filePath, DEFAULT_SEMANTIC, this.log)
    // Ensure nested objects exist (defensive against partial files)
    if (!this.data.profile) this.data.profile = {}
    if (!this.data.patterns) this.data.patterns = []
    if (!this.data.stack) this.data.stack = { ...DEFAULT_SEMANTIC.stack }
    if (!this.data.assistant) this.data.assistant = { ...DEFAULT_ASSISTANT_PROFILE }
    this.log(`[MEMORY] Semantic loaded: ${Object.keys(this.data.profile).length} profile keys, ${this.data.patterns.length} patterns`)
  }

  /** Get full semantic memory data. */
  getData(): SemanticMemoryData {
    return this.data
  }

  /** Get profile key count. */
  getProfileKeyCount(): number {
    return Object.keys(this.data.profile).length
  }

  /** Update assistant profile fields */
  async updateAssistantProfile(partial: Partial<AssistantProfile>): Promise<void> {
    this.pushVersion()
    this.data.assistant = { ...this.data.assistant, ...partial }
    this.log(`[MEMORY] Assistant Identity updated: ${JSON.stringify(partial)}`)
    this.scheduleSave()
  }

  /**
   * Replace internal data with a reconciled snapshot and persist to disk.
   * Used exclusively by the reconciliation layer at session start.
   */
  async patchAndSave(reconciledData: SemanticMemoryData): Promise<void> {
    this.pushVersion()
    this.data = reconciledData
    await this.save() // immediate save for boot critical paths
    this.log(`[MEMORY] Reconciled snapshot persisted. Profile keys: ${Object.keys(this.data.profile).length}`)
  }

  /** Update a profile entry (explicit user action). */
  async updateProfile(
    key: string,
    value: string | string[],
    source: MemorySource = 'explicit',
    confidence: Confidence = 'high',
  ): Promise<void> {
    // Governance check on the value
    const valueStr = Array.isArray(value) ? value.join(' ') : value
    const check = checkContent(valueStr)
    if (!check.allowed) {
      this.log(`[MEMORY] Profile update blocked by governance: ${key} — ${check.reason}`)
      throw new Error(check.reason ?? 'Contenido bloqueado por seguridad')
    }

    const now = new Date().toISOString()
    const existing = this.data.profile[key]
    const oldValue = existing?.value

    this.pushVersion()
    this.data.profile[key] = {
      value,
      confidence,
      source,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    this.scheduleSave()
    this.log(`[MEMORY] Profile updated: ${key}: ${JSON.stringify(oldValue)} → ${JSON.stringify(value)} (${source}, ${confidence})`)
  }

  /** Push current state to history stack. */
  private pushVersion(): void {
    this.history.push(JSON.parse(JSON.stringify(this.data)))
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift()
    }
  }

  /** Rollback to previous version in history. */
  async rollback(): Promise<boolean> {
    if (this.history.length === 0) return false
    const previous = this.history.pop()
    if (previous) {
      this.data = previous
      await this.save() // immediate save on rollback
      this.log('[MEMORY] Rolled back to previous version.')
      return true
    }
    return false
  }

  /** Debounce disk writes. */
  private scheduleSave(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout)
    this.saveTimeout = setTimeout(() => {
      this.save().catch(err => this.log(`[MEMORY_ERROR] Deferred save failed: ${err}`))
    }, 1000)
  }

  /** Persist current state to disk (atomic). */
  async save(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    await writeAtomic(this.filePath, this.data)
  }
}
