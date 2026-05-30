// ── Memory Reconciliation — Session Start Layer ──────────────
// Runs once at initialization to detect and resolve identity conflicts,
// deprecate stale naming preferences, and consolidate assistant profile.
//
// Design principle: non-destructive. Entries are marked as deprecated
// rather than deleted, preserving audit trail. Hard deletes only happen
// when the entry is proven to conflict with the canonical identity.

import type { SemanticMemoryData, ProfileEntry, LogFn } from './types'

// Patterns that indicate a naming directive aimed at the assistant.
// These should live in assistant.assistant_name, NOT in user profile.
const NAMING_DIRECTIVE_PATTERNS = [
  /(?:prefiero que te llames|llamate|tu nombre (?:ahora )?es|te vas a llamar|pasas a llamarte|quiero que te llames)\s+(\w+)/i,
  /(?:que te llames)\s+(\w+)/i,
  /(?:llámese|llámame)\s+(\w+)/i,
]

export interface ReconciliationReport {
  conflictsFound:    number
  conflictsResolved: number
  deprecatedKeys:    string[]
  canonicalName:     string
  wasClean:          boolean
}

/**
 * Detect profile entries that are actually assistant naming directives
 * (e.g. "que te llames Rogelia") and return their keys.
 */
function findNamingConflicts(
  profile: Record<string, ProfileEntry>,
  canonicalName: string,
): string[] {
  const conflictKeys: string[] = []

  for (const [key, entry] of Object.entries(profile)) {
    const value = Array.isArray(entry.value) ? entry.value.join(' ') : entry.value
    const valueLower = value.toLowerCase()

    const isNamingDirective = NAMING_DIRECTIVE_PATTERNS.some(p => p.test(value))
    const mentionsOldName = valueLower.includes('marta') ||
                            valueLower.includes('rogelia') ||
                            valueLower.includes('santi') ||
                            valueLower.includes('argos')

    if (isNamingDirective || (mentionsOldName && key === 'preferences')) {
      conflictKeys.push(key)
    }
  }

  return conflictKeys
}

/**
 * Mark a profile entry as deprecated by prefixing its key with 'deprecated__'
 * and adding a note to the value. Returns the new mutated profile.
 */
function deprecateProfileEntry(
  profile: Record<string, ProfileEntry>,
  key: string,
  reason: string,
): Record<string, ProfileEntry> {
  const entry = profile[key]
  if (!entry) return profile

  const newKey = key.startsWith('deprecated__') ? key : `deprecated__${key}`
  const newProfile = { ...profile }

  // Move to deprecated key with annotation
  newProfile[newKey] = {
    ...entry,
    confidence: 'low' as const,
    source: 'inferred' as const,
    updatedAt: new Date().toISOString(),
    // Preserve value with deprecation note in metadata
    value: Array.isArray(entry.value)
      ? entry.value
      : `${entry.value} [deprecated: ${reason}]`,
  }

  // Remove original key
  delete newProfile[key]

  return newProfile
}

/**
 * Run the full reconciliation pass on semantic memory data.
 * Returns a modified copy of the data and a report.
 * Does NOT write to disk — caller is responsible for persistence.
 */
export function reconcileMemory(
  data: SemanticMemoryData,
  log: LogFn,
): { data: SemanticMemoryData; report: ReconciliationReport } {
  const canonicalName = data.assistant?.assistant_name || 'Argos'
  const report: ReconciliationReport = {
    conflictsFound: 0,
    conflictsResolved: 0,
    deprecatedKeys: [],
    canonicalName,
    wasClean: true,
  }

  log(`[RECONCILIATION] Starting session reconciliation. Canonical name: "${canonicalName}"`)

  // 1. Find naming conflicts in user profile
  const conflictKeys = findNamingConflicts(data.profile, canonicalName)
  report.conflictsFound = conflictKeys.length

  if (conflictKeys.length === 0) {
    log(`[RECONCILIATION] Clean session — no identity conflicts detected.`)
    return { data, report }
  }

  report.wasClean = false
  log(`[RECONCILIATION] Found ${conflictKeys.length} naming conflict(s): [${conflictKeys.join(', ')}]`)

  // 2. Deprecate each conflicting entry
  let updatedProfile = { ...data.profile }
  for (const key of conflictKeys) {
    const entry = updatedProfile[key]
    const value = entry ? (Array.isArray(entry.value) ? entry.value.join(', ') : entry.value) : ''
    log(`[RECONCILIATION] Deprecating profile key "${key}" (value: "${value}") — superseded by assistant.assistant_name="${canonicalName}"`)

    updatedProfile = deprecateProfileEntry(
      updatedProfile,
      key,
      `superseded by assistant identity "${canonicalName}"`,
    )

    report.deprecatedKeys.push(key)
    report.conflictsResolved++
  }

  const reconciledData: SemanticMemoryData = {
    ...data,
    profile: updatedProfile,
  }

  log(`[RECONCILIATION] Complete. Resolved ${report.conflictsResolved}/${report.conflictsFound} conflicts. Profile now has ${Object.keys(updatedProfile).length} entries.`)

  return { data: reconciledData, report }
}
