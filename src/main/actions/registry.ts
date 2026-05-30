// ── Action Registry — Typed command system ───────────────────
// Centralized command infrastructure with permissions, categories,
// confirmation pipeline, history, and event bus.
// Commands never touch the filesystem directly from renderer.

import type { MemoryManager } from '../memory/MemoryManager'
import type { VoiceManager } from '../voice/VoiceManager'
import type { Logger } from '../logger'
import type { LLMManager } from '../services/llm/LLMManager'
import { permissionManager } from '../security/PermissionManager'
import type { Capability } from '../security/types'

// ── Types ──

export type PermissionLevel = 'public' | 'elevated' | 'debug'
export type CommandCategory = 'chat' | 'memory' | 'system' | 'debug'

/** Result returned by every command execution. */
export interface ActionResult {
  success: boolean
  message: string
  data?: Record<string, unknown>
}

/** Definition of a single command. */
export interface ActionDef {
  name: string
  aliases?: string[]
  description: string
  usage: string
  category: CommandCategory
  permission: PermissionLevel
  /** If true, dispatcher returns a confirmation prompt before executing. */
  confirm?: boolean
  confirmMessage?: string
  /** Capability required to run this command, if any */
  requiredCapability?: Capability
  /** Explicit scope for the required capability */
  capabilityScope?: string
  execute: (args: string, ctx: ActionContext) => Promise<ActionResult>
}

/** Context passed to every command during execution. */
export interface ActionContext {
  memoryManager: MemoryManager | null
  voiceManager: VoiceManager | null
  llmManager?: LLMManager | null
  logger: Logger
  /** Current permission level of the caller. */
  callerPermission: PermissionLevel
}

/** Entry in command history. */
export interface HistoryEntry {
  timestamp: string
  command: string
  args: string
  result: ActionResult
  durationMs: number
}

// ── Permission check ──

const PERM_ORDER: Record<PermissionLevel, number> = {
  public: 0,
  elevated: 1,
  debug: 2,
}

function hasPermission(caller: PermissionLevel, required: PermissionLevel): boolean {
  return PERM_ORDER[caller] >= PERM_ORDER[required]
}

// ── Event Bus ──

type EventName = 'action:before' | 'action:after' | 'action:error' | 'action:confirm-pending'
type EventPayload = {
  'action:before': { name: string; args: string }
  'action:after': { name: string; args: string; result: ActionResult; durationMs: number }
  'action:error': { name: string; args: string; error: string }
  'action:confirm-pending': { confirmId: string; command: string; args: string; message: string }
}

type Listener<T extends EventName> = (payload: EventPayload[T]) => void
const listeners = new Map<EventName, Set<Listener<any>>>()

export function on<T extends EventName>(event: T, fn: Listener<T>): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event)!.add(fn)
  return () => { listeners.get(event)?.delete(fn) }
}

function emit<T extends EventName>(event: T, payload: EventPayload[T]): void {
  listeners.get(event)?.forEach(fn => { try { fn(payload) } catch { /* listener error ignored */ } })
}

// ── Registry ──

const registry = new Map<string, ActionDef>()
const aliasMap = new Map<string, string>() // alias → canonical name

export function registerAction(action: ActionDef): void {
  registry.set(action.name, action)
  if (action.aliases) {
    for (const alias of action.aliases) {
      aliasMap.set(alias, action.name)
    }
  }
}

/** Resolve alias to canonical name. */
function resolveAlias(name: string): string {
  return aliasMap.get(name) || name
}

export function getAction(name: string): ActionDef | undefined {
  return registry.get(resolveAlias(name))
}

export function getAllActions(): ActionDef[] {
  return Array.from(registry.values())
}

export function getActionsByCategory(category: CommandCategory): ActionDef[] {
  return getAllActions().filter(a => a.category === category)
}

// ── History ──

const MAX_HISTORY = 50
const history: HistoryEntry[] = []

function recordHistory(command: string, args: string, result: ActionResult, durationMs: number): void {
  history.push({
    timestamp: new Date().toISOString(),
    command,
    args,
    result,
    durationMs,
  })
  if (history.length > MAX_HISTORY) history.shift()
}

export function getHistory(): HistoryEntry[] {
  return [...history]
}

export function getActionStats(): Record<string, { count: number; successes: number; failures: number; avgMs: number }> {
  const stats: Record<string, { count: number; successes: number; failures: number; totalMs: number }> = {}
  for (const entry of history) {
    if (!stats[entry.command]) {
      stats[entry.command] = { count: 0, successes: 0, failures: 0, totalMs: 0 }
    }
    const s = stats[entry.command]
    s.count++
    if (entry.result.success) s.successes++
    else s.failures++
    s.totalMs += entry.durationMs
  }
  const result: Record<string, { count: number; successes: number; failures: number; avgMs: number }> = {}
  for (const [cmd, s] of Object.entries(stats)) {
    result[cmd] = { count: s.count, successes: s.successes, failures: s.failures, avgMs: Math.round(s.totalMs / s.count) }
  }
  return result
}

// ── Confirmation Pipeline ──

interface PendingConfirmation {
  confirmId: string
  action: ActionDef
  args: string
  ctx: ActionContext
  createdAt: number
}

const pendingConfirmations = new Map<string, PendingConfirmation>()
const CONFIRM_TIMEOUT_MS = 30_000 // 30s to confirm
let confirmCounter = 0

function createConfirmation(action: ActionDef, args: string, ctx: ActionContext): string {
  const confirmId = `confirm-${++confirmCounter}-${Date.now()}`
  pendingConfirmations.set(confirmId, {
    confirmId,
    action,
    args,
    ctx,
    createdAt: Date.now(),
  })
  // Auto-expire
  setTimeout(() => { pendingConfirmations.delete(confirmId) }, CONFIRM_TIMEOUT_MS)
  return confirmId
}

export async function executeConfirmation(confirmId?: string): Promise<ActionResult> {
  let pending: PendingConfirmation | undefined

  if (confirmId) {
    pending = pendingConfirmations.get(confirmId)
  } else {
    // If no ID provided, get the most recent one
    let latestTime = 0
    for (const p of pendingConfirmations.values()) {
      if (p.createdAt > latestTime) {
        latestTime = p.createdAt
        pending = p
      }
    }
  }

  if (!pending) {
    return { success: false, message: 'No pending confirmation found (expired or invalid).' }
  }
  pendingConfirmations.delete(pending.confirmId)

  if (Date.now() - pending.createdAt > CONFIRM_TIMEOUT_MS) {
    return { success: false, message: 'Confirmation expired.' }
  }

  // Execute the actual command
  return executeAction(pending.action, pending.args, pending.ctx)
}

export function cancelConfirmation(confirmId?: string): ActionResult {
  let toDelete = confirmId
  if (!toDelete) {
    // If no ID provided, get the most recent one
    let latestTime = 0
    for (const p of pendingConfirmations.values()) {
      if (p.createdAt > latestTime) {
        latestTime = p.createdAt
        toDelete = p.confirmId
      }
    }
  }

  const existed = toDelete ? pendingConfirmations.delete(toDelete) : false
  return {
    success: true,
    message: existed ? '✕ Action cancelled.' : 'Nothing to cancel.',
  }
}

// ── Parser ──

/** Parse a raw slash command string into name + args. */
export function parseCommand(input: string): { name: string; args: string } | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null

  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) {
    return { name: resolveAlias(trimmed.slice(1).toLowerCase()), args: '' }
  }
  return {
    name: resolveAlias(trimmed.slice(1, spaceIdx).toLowerCase()),
    args: trimmed.slice(spaceIdx + 1).trim(),
  }
}

// ── Execution ──

/** Internal execution (after permission & confirmation checks). */
async function executeAction(action: ActionDef, args: string, ctx: ActionContext): Promise<ActionResult> {
  const start = Date.now()
  try {
    const result = await action.execute(args, ctx)
    const durationMs = Date.now() - start
    recordHistory(action.name, args, result, durationMs)
    emit('action:after', { name: action.name, args, result, durationMs })
    ctx.logger.info(`[ACTION] /${action.name} → ${result.success ? 'OK' : 'FAIL'} (${durationMs}ms): ${result.message}`)
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const durationMs = Date.now() - start
    const result: ActionResult = { success: false, message: `Command error: ${msg}` }
    recordHistory(action.name, args, result, durationMs)
    emit('action:error', { name: action.name, args, error: msg })
    ctx.logger.error(`[ACTION] /${action.name} threw (${durationMs}ms):`, err)
    return result
  }
}

/** Dispatch a command by name. Handles permissions, confirmation, and execution. */
export async function dispatchAction(
  name: string,
  args: string,
  ctx: ActionContext,
): Promise<ActionResult> {
  const resolved = resolveAlias(name)
  const action = registry.get(resolved)
  if (!action) {
    return {
      success: false,
      message: `Unknown command: /${name}. Type /help to see available commands.`,
    }
  }

  // Legacy Permission check
  if (!hasPermission(ctx.callerPermission, action.permission)) {
    ctx.logger.warn(`[ACTION] Permission denied: /${resolved} requires ${action.permission}, caller has ${ctx.callerPermission}`)
    return {
      success: false,
      message: `Permission denied. /${resolved} requires ${action.permission} level.`,
    }
  }

  // Zero-Trust Permission Check
  if (action.requiredCapability) {
    const scope = action.capabilityScope || 'system:default'
    const granted = await permissionManager.request({
      capability: action.requiredCapability,
      scope,
      origin: `command:/${resolved}`
    })

    if (!granted) {
      return { success: false, message: `Access Denied: Requiere capability '${action.requiredCapability}' sobre '${scope}'.` }
    }
  }

  emit('action:before', { name: resolved, args })

  // Confirmation check
  if (action.confirm) {
    const confirmId = createConfirmation(action, args, ctx)
    const confirmMsg = action.confirmMessage || `Are you sure you want to run /${resolved}?`
    emit('action:confirm-pending', { confirmId, command: resolved, args, message: confirmMsg })
    return {
      success: true,
      message: `⚠ ${confirmMsg}\nType /confirm to proceed or /cancel to abort.`,
      data: { needsConfirmation: true, confirmId },
    }
  }

  return executeAction(action, args, ctx)
}
