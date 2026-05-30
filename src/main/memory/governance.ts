// ── Memory System — Governance Layer ─────────────────────────
// Hard-coded content filter. Security rules here cannot be bypassed
// by editing memory-rules.md — that file is documentation only.

import { PROHIBITED_PATTERNS } from './constants'

export interface GovernanceResult {
  allowed: boolean
  reason?: string
}

/**
 * Check whether content is safe to persist in memory.
 * Returns { allowed: false, reason } if prohibited patterns are detected.
 */
export function checkContent(text: string): GovernanceResult {
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        reason: `Contenido bloqueado por seguridad: patrón detectado (${pattern.source.slice(0, 30)}…)`,
      }
    }
  }
  return { allowed: true }
}

/**
 * Sanitize a string for use as part of a filename.
 * Removes path separators and special characters.
 */
export function sanitizeForFilename(input: string): string {
  return input
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .trim()
    .slice(0, 80)
}
