// ── Memory System — MemoryManager (Orchestrator) ─────────────
// Single coordinator for all memory layers.
// Main process is the sole owner — renderer accesses via IPC only.

import { join } from 'path'
import { promises as fs } from 'fs'
import type {
  ChatMessage, MemoryConfig, MemoryStatus, SemanticMemoryData,
  EpisodicMemoryData, VaultIndexEntry, SaveExplicitResult, MigrationResult, LogFn,
} from './types'
import {
  DEFAULT_CONFIG, DEFAULT_EPISODIC, MEMORY_LIMITS, MEMORY_RULES_MD,
} from './constants'
import { writeAtomic, readSafe, ensureDir, recoverTmpFiles } from './atomicFs'
import { WorkingMemory } from './workingMemory'
import { SemanticMemory } from './semanticMemory'
import { VaultMemory } from './vaultMemory'
import { CognitiveLayer } from './CognitiveLayer'
import { assembleMemoryPreamble } from './retrieval'
import { dumpMemoryState, integrityCheck } from './debug'
import { reconcileMemory } from './reconciliation'

export class MemoryManager {
  private baseDir: string
  private config: MemoryConfig
  private working: WorkingMemory
  private semantic: SemanticMemory
  private vault: VaultMemory
  private cognitive: CognitiveLayer
  private log: LogFn
  private logError: LogFn
  private initialized = false
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private isFlushing = false
  private turnsSinceFlush = 0
  private onSyncCallback?: () => void

  constructor(userDataPath: string, log: LogFn, logError: LogFn) {
    this.baseDir = join(userDataPath, 'memory')
    this.log = log
    this.logError = logError
    this.config = { ...DEFAULT_CONFIG }
    this.working = new WorkingMemory(this.baseDir, log)
    this.semantic = new SemanticMemory(this.baseDir, log)
    this.vault = new VaultMemory(this.baseDir, log)
    this.cognitive = new CognitiveLayer()
  }

  public setOnSync(callback: () => void) {
    this.onSyncCallback = callback;
  }

  /** Initialize the memory system. Call once after app.whenReady(). */
  async initialize(): Promise<void> {
    try {
      this.log('[MEMORY] Initializing memory system...')

      // 1. Create directory structure
      await ensureDir(join(this.baseDir, 'working'))
      await ensureDir(join(this.baseDir, 'episodic'))
      await ensureDir(join(this.baseDir, 'semantic'))
      await ensureDir(join(this.baseDir, 'vault', 'entries'))

      // 2. Recover any orphaned .tmp files from previous crash
      await recoverTmpFiles(this.baseDir, this.log)

      // 3. Load or create config
      this.config = await readSafe<MemoryConfig>(
        this.configPath, { ...DEFAULT_CONFIG, createdAt: new Date().toISOString() }, this.log,
      )
      if (!this.config.createdAt) {
        this.config.createdAt = new Date().toISOString()
        await this.saveConfig()
      }

      // 4. Generate governance document if missing
      await this.ensureGovernanceDoc()

      // 5. Ensure episodic file exists
      const episodicPath = join(this.baseDir, 'episodic', 'episodic.json')
      await readSafe(episodicPath, DEFAULT_EPISODIC, this.log).then(async data => {
        try {
          await fs.access(episodicPath)
        } catch {
          await writeAtomic(episodicPath, data)
        }
      })

      // 6. Load memory layers
      await this.working.load()
      await this.semantic.load()
      await this.vault.load()

      // 7. Reconcile identity — must run after semantic.load() so we have
      //    the canonical assistant_name, and before initialized=true so the
      //    first request already gets the clean profile.
      const rawData = this.semantic.getData()
      const { data: reconciledData, report } = reconcileMemory(rawData, this.log)
      if (!report.wasClean) {
        // Patch the semantic layer with the reconciled data and persist immediately
        await this.semantic.patchAndSave(reconciledData)
        this.log(
          `[RECONCILIATION_APPLIED] Deprecated keys: [${report.deprecatedKeys.join(', ')}] ` +
          `→ canonical name locked to "${report.canonicalName}"`,
        )
      }

      this.initialized = true
      this.startPeriodicFlush()
      this.log(
        `[MEMORY_RESTORE] Engine initialized. Profile: ${this.semantic.getProfileKeyCount()} keys, ` +
        `Vault: ${this.vault.getCount()} entries, ` +
        `Working Turns: ${this.working.getTurnCount()}`,
      )
      
      const profileData = this.semantic.getData().profile
      for (const [key, entry] of Object.entries(profileData)) {
        this.log(`[MEMORY_PROFILE_LOADED] ${key}: ${Array.isArray(entry.value) ? entry.value.join(', ') : entry.value}`)
      }
    } catch (err) {
      this.logError('[MEMORY] Initialization failed:', err)
      // Non-fatal — app continues without memory system
      this.initialized = false
    }
  }

  /** Flush working memory and save config on app quit. */
  async shutdown(): Promise<void> {
    if (!this.initialized) return
    try {
      if (this.flushTimer) {
        clearInterval(this.flushTimer)
        this.flushTimer = null
      }
      await this.working.flush()
      await this.saveConfig()
      this.log(`[MEMORY] Shutdown complete. Turns flushed: ${this.working.getTurnCount()}`)
    } catch (err) {
      this.logError('[MEMORY] Shutdown error:', err)
    }
  }

  // ── Working Memory ──

  /** Append a chat turn to working memory. */
  appendTurn(msg: ChatMessage): void {
    if (!this.initialized) return
    this.working.appendTurn(msg)
    this.turnsSinceFlush++
    
    if (msg.role === 'user') {
      this.cognitive.processTurn(msg.content, '')
    }
  }

  /** Get current turn count. */
  getTurnCount(): number {
    return this.working.getTurnCount()
  }

  // ── Semantic Memory ──

  /** Get the full semantic memory (profile + patterns + stack). */
  getProfile(): SemanticMemoryData {
    return this.semantic.getData()
  }

  /** Update a profile entry (explicit user action). */
  async updateProfile(key: string, value: string | string[]): Promise<void> {
    if (!this.initialized) throw new Error('Memory system not initialized')
    await this.semantic.updateProfile(key, value, 'explicit', 'high')
    this.onSyncCallback?.()
  }

  /** Update assistant profile fields */
  async updateAssistantProfile(partial: Partial<import('./types').AssistantProfile>): Promise<void> {
    if (!this.initialized) throw new Error('Memory system not initialized')
    await this.semantic.updateAssistantProfile(partial)
    this.onSyncCallback?.()
  }

  // ── Vault Memory ──

  /** Get all vault entries (index metadata only). */
  getVaultEntries(): VaultIndexEntry[] {
    return this.vault.getEntries()
  }

  /** Save a new explicit memory to the vault. */
  async saveToVault(title: string, content: string, tags: string[]): Promise<SaveExplicitResult> {
    if (!this.initialized) throw new Error('Memory system not initialized')
    const result = await this.vault.save(title, content, tags, 'explicit')
    this.onSyncCallback?.()
    return result
  }

  /** Delete a vault entry by id. */
  async deleteFromVault(id: string): Promise<boolean> {
    if (!this.initialized) throw new Error('Memory system not initialized')
    const result = await this.vault.delete(id)
    this.onSyncCallback?.()
    return result
  }

  // ── Migration ──

  /** Check if migration should be offered to the renderer. */
  shouldOfferMigration(): boolean {
    return this.initialized && !this.config.migrated && !this.config.migrationOffered
  }

  /** Mark that migration was offered (even if user declined). */
  async markMigrationOffered(): Promise<void> {
    this.config.migrationOffered = true
    await this.saveConfig()
  }

  /** Migrate chat history from localStorage (one-shot, opt-in). */
  async migrate(messages: ChatMessage[]): Promise<MigrationResult> {
    if (!this.initialized) return { success: false, turnsMigrated: 0 }
    if (this.config.migrated) return { success: true, turnsMigrated: 0 }

    try {
      this.working.loadTurns(messages)
      await this.working.flush()

      this.config.migrated = true
      await this.saveConfig()

      this.log(`[MEMORY] Migration complete: ${messages.length} turns migrated.`)
      return { success: true, turnsMigrated: messages.length }
    } catch (err) {
      this.logError('[MEMORY] Migration failed:', err)
      return { success: false, turnsMigrated: 0 }
    }
  }

  // ── Status ──

  /** Get a summary of the memory system status. */
  getStatus(): MemoryStatus {
    return {
      initialized: this.initialized,
      migrated: this.config.migrated,
      turnCount: this.working.getTurnCount(),
      vaultCount: this.vault.getCount(),
      profileKeys: this.semantic.getProfileKeyCount(),
    }
  }

  // ── Retrieval ──

  /** Assemble memory preamble + metadata for injection into system prompt. */
  getMemoryContext(currentInput: string): { preamble: string; usedMemories: Array<{ type: string; label: string; score: number }> } {
    if (!this.initialized) return { preamble: '', usedMemories: [] }
    
    // Cognitive Attention Routing
    // Retrieve ALL relevant semantic patterns + vault triggers
    const profile = this.semantic.getData()
    const rawVault = this.vault.getEntries()
    
    // Filter vault entries via Attention Routing
    const relevantVault = this.cognitive.filterRelevantMemories(rawVault, 5)

    return assembleMemoryPreamble(profile, relevantVault, currentInput, this.cognitive)
  }

  /** Get active cognitive state for UI visualization */
  getCognitiveState(): { activeTopic: string | null; contextPressure: number } {
    if (!this.initialized) return { activeTopic: null, contextPressure: 0 }
    return {
      activeTopic: this.cognitive.getActiveTopic(),
      contextPressure: (this.cognitive as any).state.contextPressure
    }
  }

  // ── Debug ──

  /** Run integrity check on all memory files. */
  async runIntegrityCheck(): Promise<void> {
    await integrityCheck(this.baseDir, this.log)
  }

  /** Dump full memory state to logs. */
  async dumpState(): Promise<void> {
    await dumpMemoryState(this.baseDir, this.log)
  }

  // ── Private ──

  private get configPath(): string {
    return join(this.baseDir, 'config.json')
  }

  private async saveConfig(): Promise<void> {
    await writeAtomic(this.configPath, this.config)
  }

  private async ensureGovernanceDoc(): Promise<void> {
    const rulesPath = join(this.baseDir, 'memory-rules.md')
    try {
      await fs.access(rulesPath)
    } catch {
      await fs.writeFile(rulesPath, MEMORY_RULES_MD, 'utf-8')
      this.log('[MEMORY] Created memory-rules.md governance document.')
    }
  }

  /** Start periodic crash-safe flush of working memory. */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(async () => {
      if (this.isFlushing) return
      if (this.turnsSinceFlush < MEMORY_LIMITS.FLUSH_MIN_TURNS_DELTA) return

      this.isFlushing = true
      try {
        await this.working.flush()
        this.log(`[MEMORY] Periodic flush: ${this.turnsSinceFlush} turns saved.`)
        this.turnsSinceFlush = 0
      } catch (err) {
        this.logError('[MEMORY] Periodic flush error:', err)
      } finally {
        this.isFlushing = false
      }
    }, MEMORY_LIMITS.FLUSH_INTERVAL_MS)
    // Prevent the timer from keeping the Node process alive after window close
    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      (this.flushTimer as NodeJS.Timeout).unref()
    }
  }

  /** Synchronous episodic data access (cached from disk on init). */
  private loadEpisodicSync(): EpisodicMemoryData {
    // Episodic is small and read infrequently — read from disk each time.
    // This avoids keeping another in-memory cache while Phase B isn't implemented.
    // Uses a blocking approach acceptable for <50KB file.
    try {
      const raw = require('fs').readFileSync(
        join(this.baseDir, 'episodic', 'episodic.json'), 'utf-8',
      )
      return JSON.parse(raw) as EpisodicMemoryData
    } catch {
      return DEFAULT_EPISODIC
    }
  }
}
