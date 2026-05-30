// ── ArgOS Boot Banner ──────────────────────────────────────────────────────
// Displays the ASCII splash screen at process startup.
// Pure console output — zero side effects on app logic, memory, or identity.
// Call showBootBanner() before app.whenReady() to print during Node init.

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

// ── ANSI color helpers ─────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  white:   '\x1b[97m',
  gray:    '\x1b[90m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
} as const

// ── ASCII Art ─────────────────────────────────────────────────────────────
const ASCII_LOGO = `
${C.cyan}${C.bold} █████╗ ██████╗  ██████╗  ██████╗ ███████╗${C.reset}
${C.cyan}${C.bold}██╔══██╗██╔══██╗██╔════╝ ██╔═══██╗██╔════╝${C.reset}
${C.cyan}${C.bold}███████║██████╔╝██║  ███╗██║   ██║███████╗${C.reset}
${C.cyan}${C.bold}██╔══██║██╔══██╗██║   ██║██║   ██║╚════██║${C.reset}
${C.cyan}${C.bold}██║  ██║██║  ██║╚██████╔╝╚██████╔╝███████║${C.reset}
${C.cyan}${C.bold}╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝${C.reset}`

const SEPARATOR = `${C.gray}${'─'.repeat(48)}${C.reset}`

// ── Version detection ─────────────────────────────────────────────────────
function getVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../package.json') as { version: string }
    return pkg.version ?? '3.1.x'
  } catch {
    return '3.1.x'
  }
}

// ── Runtime Status checks ─────────────────────────────────────────────────
interface StatusCheck {
  label: string
  ok: boolean
  detail?: string
}

function checkRuntimeStatus(userDataPath: string): StatusCheck[] {
  const memoryDir   = join(userDataPath, 'memory')
  const semanticDir = join(userDataPath, 'memory', 'semantic')
  const dbPath      = join(userDataPath, 'knowledge.db')
  const agentDir    = join(userDataPath, 'agent')

  return [
    {
      label: 'Memory Engine',
      ok: existsSync(memoryDir),
      detail: existsSync(memoryDir) ? memoryDir : 'Not initialized yet',
    },
    {
      label: 'Semantic Index',
      ok: existsSync(semanticDir),
      detail: existsSync(semanticDir) ? join(semanticDir, 'semantic.json') : 'No semantic directory',
    },
    {
      label: 'Local Database',
      ok: existsSync(dbPath),
      detail: existsSync(dbPath) ? dbPath : 'knowledge.db not found (created on first use)',
    },
    {
      label: 'AGRAx Hub',
      ok: existsSync(agentDir),
      detail: existsSync(agentDir) ? agentDir : 'Agent state directory not yet created',
    },
  ]
}

// ── Environment checks ─────────────────────────────────────────────────────
interface EnvCheck {
  label: string
  ok: boolean
  version?: string
}

function tryExec(cmd: string): string | null {
  try {
    return execSync(cmd, { timeout: 3000, stdio: 'pipe' }).toString().trim()
  } catch {
    return null
  }
}

function checkEnvironment(userDataPath: string): EnvCheck[] {
  // Node.js
  const nodeVer = process.version ?? null

  // PNPM
  const pnpmVer = tryExec('pnpm --version')

  // SQLite (via better-sqlite3 presence)
  let sqliteOk = false
  let sqliteVer: string | undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sqlite = require('better-sqlite3')
    const db = sqlite(':memory:')
    const row = db.prepare('SELECT sqlite_version() as v').get() as { v: string }
    sqliteVer = row?.v
    db.close()
    sqliteOk = true
  } catch {
    sqliteOk = false
  }

  // AppData directory
  const appDataOk = existsSync(userDataPath)

  // Whisper models
  const modelsDir = join(process.cwd(), 'vendor', 'whisper', 'models')
  const modelsOk  = existsSync(modelsDir) && existsSync(join(modelsDir, 'ggml-base.bin'))

  return [
    { label: 'Node.js', ok: !!nodeVer, version: nodeVer ?? undefined },
    { label: 'PNPM',    ok: !!pnpmVer, version: pnpmVer ?? undefined },
    { label: 'SQLite',  ok: sqliteOk,  version: sqliteVer },
    { label: 'AppData', ok: appDataOk, version: appDataOk ? userDataPath : undefined },
    { label: 'Models',  ok: modelsOk,  version: modelsOk ? 'ggml-base.bin ✓' : undefined },
  ]
}

// ── Render helpers ─────────────────────────────────────────────────────────
function renderStatusRow(label: string, ok: boolean): string {
  const icon   = ok ? `${C.green}[✓]${C.reset}` : `${C.red}[✗]${C.reset}`
  const padded = label.padEnd(20)
  return `  ${icon} ${C.white}${padded}${C.reset}`
}

function renderEnvRow(label: string, ok: boolean, version?: string): string {
  const padded  = label.padEnd(12)
  if (!ok) {
    return `  ${C.gray}${padded}${C.reset}  ${C.red}[MISSING]${C.reset}`
  }
  const verStr = version ? `${C.dim}${version}${C.reset}` : ''
  return `  ${C.green}${padded}${C.reset}  ${verStr}`
}

// ── Main export ────────────────────────────────────────────────────────────
/**
 * Renders the ArgOS boot banner to stdout.
 * Call once at process start, before app.whenReady().
 *
 * @param userDataPath  Electron's app.getPath('userData') — used for disk checks.
 */
export function showBootBanner(userDataPath: string): void {
  const version = getVersion()
  const runtime = checkRuntimeStatus(userDataPath)
  const env     = checkEnvironment(userDataPath)

  const lines: string[] = []

  // ── Logo ────────────────────────────────────────────────────
  lines.push(ASCII_LOGO)
  lines.push('')

  // ── Tagline ─────────────────────────────────────────────────
  lines.push(`  ${C.white}${C.bold}ArgOS Cognitive Assistant${C.reset}`)
  lines.push(`  ${C.gray}Version: ${C.cyan}${version}${C.reset}`)
  lines.push('')
  lines.push(SEPARATOR)

  // ── Runtime Status ───────────────────────────────────────────
  lines.push(`  ${C.bold}${C.magenta}Runtime Status${C.reset}`)
  lines.push('')
  for (const check of runtime) {
    lines.push(renderStatusRow(check.label, check.ok))
  }
  lines.push('')
  lines.push(SEPARATOR)

  // ── Environment Check ────────────────────────────────────────
  lines.push(`  ${C.bold}${C.blue}Environment Check${C.reset}`)
  lines.push('')
  for (const check of env) {
    lines.push(renderEnvRow(check.label, check.ok, check.version))
  }
  lines.push('')
  lines.push(SEPARATOR)

  // ── Timestamp ────────────────────────────────────────────────
  const ts = new Date().toLocaleString('es-AR', {
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  lines.push(`  ${C.gray}Boot at ${ts}${C.reset}`)
  lines.push(SEPARATOR)
  lines.push('')

  // Write all at once to avoid interleaving with logger output
  process.stdout.write(lines.join('\n'))
}
