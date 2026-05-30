// ── Memory System — Atomic File Operations ──────────────────
// All memory persistence goes through these functions.
// Write protocol: data → .tmp file → fsync → rename (atomic on NTFS/ext4/APFS).

import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import type { LogFn } from './types'

/**
 * Atomically write JSON data to a file.
 * Writes to a .tmp file first, then renames to prevent corruption on crash.
 */
export async function writeAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpPath = filePath + '.tmp'
  const content = JSON.stringify(data, null, 2)
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(tmpPath, content, 'utf-8')
  await fs.rename(tmpPath, filePath)
}

/**
 * Safely read and parse a JSON file.
 * Returns defaultValue on missing file or parse error — never throws.
 */
export async function readSafe<T>(filePath: string, defaultValue: T, log?: LogFn): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && log) {
      log(`[MEMORY] Warning: could not read ${filePath}:`, code ?? err)
    }
    return defaultValue
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

/**
 * Recover orphaned .tmp files left by interrupted atomic writes.
 * Called once at startup to heal any crash-damaged state.
 */
export async function recoverTmpFiles(baseDir: string, log: LogFn): Promise<void> {
  const subdirs = ['', 'working', 'episodic', 'semantic', 'vault']

  for (const sub of subdirs) {
    const dir = sub ? join(baseDir, sub) : baseDir
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      continue // directory doesn't exist yet — nothing to recover
    }

    for (const entry of entries) {
      if (!entry.endsWith('.tmp')) continue

      const tmpPath = join(dir, entry)
      const originalPath = tmpPath.slice(0, -4) // remove '.tmp'

      try {
        await fs.access(originalPath)
        // Original exists → .tmp is an incomplete overwrite → discard it
        await fs.unlink(tmpPath)
        log(`[MEMORY] Recovery: discarded orphaned .tmp (original intact): ${entry}`)
      } catch {
        // Original missing → .tmp is the only copy → promote it
        await fs.rename(tmpPath, originalPath)
        log(`[MEMORY] Recovery: promoted .tmp to original (was incomplete write): ${entry}`)
      }
    }
  }
}

/**
 * Write a text file atomically (for .md vault entries).
 */
export async function writeAtomicText(filePath: string, content: string): Promise<void> {
  const tmpPath = filePath + '.tmp'
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(tmpPath, content, 'utf-8')
  await fs.rename(tmpPath, filePath)
}
