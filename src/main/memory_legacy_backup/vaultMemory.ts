// ── Memory System — Vault Memory (Layer 4) ───────────────────
// Explicit user-saved memories. Individual .md files + index.json.
// NEVER auto-pruned, NEVER auto-modified.

import { join } from 'path'
import { promises as fs } from 'fs'
import type { VaultIndex, VaultIndexEntry, SaveExplicitResult, LogFn } from './types'
import { DEFAULT_VAULT_INDEX } from './constants'
import { writeAtomic, writeAtomicText, readSafe, ensureDir } from './atomicFs'
import { checkContent, sanitizeForFilename } from './governance'

export class VaultMemory {
  private index: VaultIndex
  private indexPath: string
  private entriesDir: string
  private log: LogFn

  constructor(baseDir: string, log: LogFn) {
    this.indexPath = join(baseDir, 'vault', 'index.json')
    this.entriesDir = join(baseDir, 'vault', 'entries')
    this.log = log
    this.index = { ...DEFAULT_VAULT_INDEX, entries: [] }
  }

  /** Load vault index from disk. */
  async load(): Promise<void> {
    await ensureDir(this.entriesDir)
    this.index = await readSafe<VaultIndex>(this.indexPath, DEFAULT_VAULT_INDEX, this.log)
    if (!this.index.entries) this.index.entries = []

    // Self-heal: remove index entries whose .md file is missing
    const validEntries: VaultIndexEntry[] = []
    for (const entry of this.index.entries) {
      try {
        await fs.access(join(this.entriesDir, entry.filename))
        validEntries.push(entry)
      } catch {
        this.log(`[MEMORY] Vault self-heal: removed orphaned index entry "${entry.title}" (file missing)`)
      }
    }

    if (validEntries.length !== this.index.entries.length) {
      this.index.entries = validEntries
      await this.saveIndex()
    }

    this.log(`[MEMORY] Vault loaded: ${this.index.entries.length} entries`)
  }

  /** Get all vault entries (index only, not full content). */
  getEntries(): VaultIndexEntry[] {
    return this.index.entries
  }

  /** Get vault entry count. */
  getCount(): number {
    return this.index.entries.length
  }

  /** Save a new vault entry. Returns the created entry's id and filename. */
  async save(
    title: string,
    content: string,
    tags: string[],
    trigger: 'explicit' | 'detected-intent' = 'explicit',
  ): Promise<SaveExplicitResult> {
    // Governance check
    const fullText = `${title} ${content} ${tags.join(' ')}`
    const check = checkContent(fullText)
    if (!check.allowed) {
      this.log(`[MEMORY] Vault save blocked by governance: "${title}" — ${check.reason}`)
      throw new Error(check.reason ?? 'Contenido bloqueado por seguridad')
    }

    const id = `v_${Date.now()}`
    const filename = `${id}.md`
    const now = new Date().toISOString()
    const safeTitle = sanitizeForFilename(title) || 'untitled'

    // Generate markdown content
    const triggerLabel = trigger === 'explicit' ? 'Guardado por el usuario' : 'Intención detectada'
    const md = [
      `# ${title}`,
      '',
      `**Saved:** ${now}`,
      `**Trigger:** ${triggerLabel}`,
      `**Tags:** ${tags.join(', ') || 'sin tags'}`,
      '',
      '---',
      '',
      content,
      '',
      '---',
      `*${triggerLabel}.*`,
      '',
    ].join('\n')

    // Write .md file first, then update index
    await writeAtomicText(join(this.entriesDir, filename), md)

    const entry: VaultIndexEntry = {
      id,
      filename,
      title: safeTitle,
      tags,
      trigger,
      createdAt: now,
    }

    this.index.entries.push(entry)
    await this.saveIndex()

    this.log(`[MEMORY] Vault saved: "${title}" (${id}, ${tags.length} tags)`)
    return { id, filename }
  }

  /** Delete a vault entry by id. Returns true if found and deleted. */
  async delete(id: string): Promise<boolean> {
    const idx = this.index.entries.findIndex(e => e.id === id)
    if (idx === -1) return false

    const entry = this.index.entries[idx]

    // Delete the .md file
    try {
      await fs.unlink(join(this.entriesDir, entry.filename))
    } catch {
      // File already gone — continue with index cleanup
    }

    // Remove from index
    this.index.entries.splice(idx, 1)
    await this.saveIndex()

    this.log(`[MEMORY] Vault deleted: "${entry.title}" (${id})`)
    return true
  }

  /** Persist index to disk (atomic). */
  private async saveIndex(): Promise<void> {
    await writeAtomic(this.indexPath, this.index)
  }
}
