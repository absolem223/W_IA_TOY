import { promises as fs } from 'fs'
import { join } from 'path'

export interface AgentEvent {
  timestamp: string
  sessionId: string
  correlationId: string
  event: 
    | 'SESSION_START' 
    | 'PHASE_CHANGE' 
    | 'LLM_START' 
    | 'LLM_CHUNK' 
    | 'LLM_COMPLETE' 
    | 'LLM_ERROR' 
    | 'TOOL_START' 
    | 'TOOL_END' 
    | 'RECOVERY_REQUESTED' 
    | 'RECOVERY_RESOLVED' 
    | 'SESSION_COMPLETE' 
    | 'SESSION_ERROR'
    | 'SAFE_MODE_ENABLED'
    | 'SESSION_CORRUPTED'
    | 'RECOVERY_TIMEOUT'
    | 'LOOP_STALL_DETECTED'
    | 'LLM_FIRST_TOKEN'
  provider?: string
  model?: string
  latency?: number
  tokenUsage?: number
  failureReason?: string
  payload?: any
}

export class AgentEventStore {
  private logPath: string
  private isWriting = false
  private writeQueue: string[] = []

  constructor(userDataPath: string) {
    this.logPath = join(userDataPath, 'agent-events.log')
  }

  async log(event: Omit<AgentEvent, 'timestamp'>): Promise<void> {
    const fullEvent: AgentEvent = {
      timestamp: new Date().toISOString(),
      ...event,
    }

    const line = JSON.stringify(fullEvent) + '\n'
    this.writeQueue.push(line)
    this.processQueue()
  }

  private async processQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) return

    this.isWriting = true
    const toWrite = [...this.writeQueue]
    this.writeQueue = []

    try {
      // Append all queued events at once
      await fs.appendFile(this.logPath, toWrite.join(''), 'utf-8')
    } catch (err) {
      console.error('[EVENT_STORE] Failed to append events to file:', err)
      // Re-queue failed writes
      this.writeQueue.unshift(...toWrite)
    } finally {
      this.isWriting = false
      // If new items were added while writing, process them
      if (this.writeQueue.length > 0) {
        setImmediate(() => this.processQueue())
      }
    }
  }
}
