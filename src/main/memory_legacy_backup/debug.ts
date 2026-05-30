// ── Memory System — Debug & Inspection Utilities ─────────────
import { join } from 'path'
import { promises as fs } from 'fs'
import type { MemoryConfig, WorkingMemoryData, SemanticMemoryData, EpisodicMemoryData, VaultIndex, LogFn } from './types'
import { readSafe } from './atomicFs'
import { DEFAULT_CONFIG, DEFAULT_WORKING, DEFAULT_SEMANTIC, DEFAULT_EPISODIC, DEFAULT_VAULT_INDEX } from './constants'

export interface IntegrityResult { file: string; ok: boolean; error?: string }

export async function integrityCheck(baseDir: string, log: LogFn): Promise<IntegrityResult[]> {
  const files = [
    { path: join(baseDir, 'config.json'), label: 'config' },
    { path: join(baseDir, 'working', 'session.json'), label: 'working' },
    { path: join(baseDir, 'semantic', 'semantic.json'), label: 'semantic' },
    { path: join(baseDir, 'episodic', 'episodic.json'), label: 'episodic' },
    { path: join(baseDir, 'vault', 'index.json'), label: 'vault' },
  ]
  const results: IntegrityResult[] = []
  for (const { path, label } of files) {
    try {
      JSON.parse(await fs.readFile(path, 'utf-8'))
      results.push({ file: label, ok: true })
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      results.push({ file: label, ok: false, error: code === 'ENOENT' ? 'missing' : String(err) })
    }
  }
  log(`[MEMORY] Integrity: ${results.filter(r => r.ok).length}/${results.length} OK`)
  return results
}

export async function orphanScan(baseDir: string, log: LogFn): Promise<string[]> {
  const subdirs = ['', 'working', 'episodic', 'semantic', 'vault']
  const orphans: string[] = []
  for (const sub of subdirs) {
    const dir = sub ? join(baseDir, sub) : baseDir
    try {
      for (const e of await fs.readdir(dir)) {
        if (e.endsWith('.tmp')) orphans.push(join(sub || '.', e))
      }
    } catch { /* dir missing */ }
  }
  log(`[MEMORY] Orphan scan: ${orphans.length} .tmp files`)
  return orphans
}

export async function validateVault(baseDir: string, log: LogFn): Promise<{ valid: number; orphaned: string[] }> {
  const entriesDir = join(baseDir, 'vault', 'entries')
  const index = await readSafe<VaultIndex>(join(baseDir, 'vault', 'index.json'), DEFAULT_VAULT_INDEX)
  const orphaned: string[] = []
  let valid = 0
  for (const entry of index.entries) {
    try { await fs.access(join(entriesDir, entry.filename)); valid++ }
    catch { orphaned.push(`${entry.id}: ${entry.title}`) }
  }
  log(`[MEMORY] Vault: ${valid} valid, ${orphaned.length} orphaned`)
  return { valid, orphaned }
}

export async function stats(baseDir: string, log: LogFn): Promise<Record<string, unknown>> {
  const config = await readSafe<MemoryConfig>(join(baseDir, 'config.json'), DEFAULT_CONFIG)
  const working = await readSafe<WorkingMemoryData>(join(baseDir, 'working', 'session.json'), DEFAULT_WORKING)
  const semantic = await readSafe<SemanticMemoryData>(join(baseDir, 'semantic', 'semantic.json'), DEFAULT_SEMANTIC)
  const episodic = await readSafe<EpisodicMemoryData>(join(baseDir, 'episodic', 'episodic.json'), DEFAULT_EPISODIC)
  const vault = await readSafe<VaultIndex>(join(baseDir, 'vault', 'index.json'), DEFAULT_VAULT_INDEX)
  const result = {
    migrated: config.migrated,
    turns: working.turnCount,
    profileKeys: Object.keys(semantic.profile || {}).length,
    patterns: (semantic.patterns || []).length,
    episodes: (episodic.episodes || []).length,
    vaultEntries: (vault.entries || []).length,
  }
  log(`[MEMORY] Stats:`, JSON.stringify(result))
  return result
}

export async function dumpMemoryState(baseDir: string, log: LogFn): Promise<void> {
  log('[MEMORY] === STATE DUMP ===')
  await stats(baseDir, log)
  await integrityCheck(baseDir, log)
  await orphanScan(baseDir, log)
  await validateVault(baseDir, log)
  log('[MEMORY] === END DUMP ===')
}
