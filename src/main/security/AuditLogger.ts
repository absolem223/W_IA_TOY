import fs from 'fs'
import path from 'path'
import type { AuditEvent } from './types'

export class AuditLogger {
  private logFile: string

  constructor() {
    const logDir = path.join(process.cwd(), '.workspace', 'audit')
    fs.mkdirSync(logDir, { recursive: true })
    this.logFile = path.join(logDir, `security-${new Date().toISOString().split('T')[0]}.jsonl`)
  }

  public log(event: Omit<AuditEvent, 'timestamp'>): void {
    const fullEvent: AuditEvent = {
      timestamp: new Date().toISOString(),
      ...event
    }

    const line = JSON.stringify(fullEvent) + '\n'
    fs.appendFileSync(this.logFile, line, 'utf-8')

    // También emitimos a consola en rojo si es un denegado
    if (event.type === 'access_denied' || event.type === 'system_alert') {
      console.error(`🚨 [SECURITY ALERT] ${event.type.toUpperCase()}: ${event.origin} attempted ${event.capability} on ${event.scope}`)
    } else {
      console.log(`🛡️ [AUDIT] ${event.type}: ${event.origin} -> ${event.capability} on ${event.scope}`)
    }
  }
}
