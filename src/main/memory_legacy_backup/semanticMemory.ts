// ── Memory System — Semantic Memory (Layer 3) ────────────────
// Persistent user profile, patterns, and tech stack.
// Slow-changing, high-value information.

import { join } from 'path'
import type { SemanticMemoryData, ProfileEntry, Confidence, MemorySource, LogFn } from './types'
import { DEFAULT_SEMANTIC } from './constants'
import { writeAtomic, readSafe } from './atomicFs'
import { checkContent } from './governance'

import { DEFAULT_ASSISTANT_PROFILE } from './identityLayer'

export class SemanticMemory {
  private data: SemanticMemoryData
  private filePath: string
  private log: LogFn

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
    this.data.assistant = { ...this.data.assistant, ...partial }
    this.log(`[MEMORY] Assistant Identity updated: ${JSON.stringify(partial)}`)
    await this.save()
  }

  /**
   * Replace internal data with a reconciled snapshot and persist to disk.
   * Used exclusively by the reconciliation layer at session start.
   */
  async patchAndSave(reconciledData: SemanticMemoryData): Promise<void> {
    this.data = reconciledData
    await this.save()
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

    this.data.profile[key] = {
      value,
      confidence,
      source,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await this.save()
    this.log(`[MEMORY] Profile updated: ${key}: ${JSON.stringify(oldValue)} → ${JSON.stringify(value)} (${source}, ${confidence})`)
  }

  /** Persist current state to disk (atomic). */
  async save(): Promise<void> {
    await writeAtomic(this.filePath, this.data)
  }
}
