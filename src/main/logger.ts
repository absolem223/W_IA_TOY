// ── Structured Logger ────────────────────────────────────────
// Async writes, scoped channels, simple rotation, reusable.
// No external dependencies.

import fs from 'fs'
import path from 'path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const MAX_LOG_SIZE = 2 * 1024 * 1024  // 2MB per file
const LOG_DIR_NAME = 'logs'

let logsDir = ''
let minLevel: LogLevel = 'info'

/** Initialize the logging system. Call once at startup. */
export function initLogger(baseDir: string, level: LogLevel = 'info'): void {
  logsDir = path.join(baseDir, LOG_DIR_NAME)
  minLevel = level
  try {
    fs.mkdirSync(logsDir, { recursive: true })
  } catch {
    // Fallback to baseDir if logs subdir can't be created
    logsDir = baseDir
  }
}

/** Rotate a log file if it exceeds MAX_LOG_SIZE. */
function rotateIfNeeded(filePath: string): void {
  try {
    const stats = fs.statSync(filePath)
    if (stats.size > MAX_LOG_SIZE) {
      const backup = filePath + '.old'
      try { fs.unlinkSync(backup) } catch { /* no old backup */ }
      fs.renameSync(filePath, backup)
    }
  } catch {
    // File doesn't exist yet — nothing to rotate
  }
}

/** Format a log entry as a structured line. */
function formatEntry(level: LogLevel, channel: string, args: unknown[]): string {
  const ts = new Date().toISOString()
  const message = args
    .map(a => {
      if (a instanceof Error) return a.stack || a.message
      if (typeof a === 'object') {
        try { return JSON.stringify(a) } catch { return String(a) }
      }
      return String(a)
    })
    .join(' ')

  return `${ts} [${level.toUpperCase()}] [${channel}] ${message}\n`
}

/** Write a log entry to a specific channel file + console. */
function writeLog(level: LogLevel, channel: string, args: unknown[]): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return

  const entry = formatEntry(level, channel, args)

  // Console output (sync, always)
  if (level === 'error') {
    process.stderr.write(entry)
  } else {
    process.stdout.write(entry)
  }

  // File output (async, best-effort)
  if (!logsDir) return
  const filePath = path.join(logsDir, `${channel}.log`)
  rotateIfNeeded(filePath)
  fs.appendFile(filePath, entry, () => { /* fire-and-forget */ })
}

export interface Logger {
  debug: (...args: unknown[]) => void
  info:  (...args: unknown[]) => void
  warn:  (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  /** Simple log functions for backward compatibility (info/error pair). */
  logInfo:  (...args: unknown[]) => void
  logError: (...args: unknown[]) => void
}

const loggers = new Map<string, Logger>()

/** Create or retrieve a scoped logger for a named channel. */
export function createLogger(channel: string): Logger {
  const existing = loggers.get(channel)
  if (existing) return existing

  const logger: Logger = {
    debug: (...args) => writeLog('debug', channel, args),
    info:  (...args) => writeLog('info',  channel, args),
    warn:  (...args) => writeLog('warn',  channel, args),
    error: (...args) => writeLog('error', channel, args),
    logInfo:  (...args) => writeLog('info',  channel, args),
    logError: (...args) => writeLog('error', channel, args),
  }

  loggers.set(channel, logger)
  return logger
}

/** Flush hint — call during shutdown (no-op currently since we use async writes). */
export function flushLogs(): void {
  // fs.appendFile is already async and will complete before process exits
  // in normal shutdown. This is a hook for future sync-flush if needed.
}
