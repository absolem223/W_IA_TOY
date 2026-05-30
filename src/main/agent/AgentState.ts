export type ExecutionPhase = 'idle' | 'planning' | 'executing' | 'tool-wait' | 'responding' | 'error' | 'searching knowledge' | 'analyzing media' | 'assembling context' | 'traversing graph' | 'consolidating memory'

import { BrowserWindow } from 'electron'

export interface AgentRuntimeState {
  currentObjective: string | null
  executionPhase: ExecutionPhase
  activePlan: string[]
  retries: number
  pendingTasks: any[]
  metrics: {
    totalTimeMs: number
    toolCallsCount: number
    recursionDepth: number
  }
}

export class AgentRuntimeManager {
  private state: AgentRuntimeState

  constructor() {
    this.state = {
      currentObjective: null,
      executionPhase: 'idle',
      activePlan: [],
      retries: 0,
      pendingTasks: [],
      metrics: {
        totalTimeMs: 0,
        toolCallsCount: 0,
        recursionDepth: 0
      }
    }
  }

  getState(): AgentRuntimeState {
    return { ...this.state, metrics: { ...this.state.metrics } }
  }

  setPhase(phase: ExecutionPhase) {
    this.state.executionPhase = phase
    try {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('agent:status', phase)
      })
    } catch (e) {}
  }

  setObjective(obj: string | null) {
    this.state.currentObjective = obj
  }

  incrementRecursion() {
    this.state.metrics.recursionDepth++
  }

  addToolCallCount(count: number) {
    this.state.metrics.toolCallsCount += count
  }

  reset(objective: string | null = null) {
    this.state = {
      currentObjective: objective,
      executionPhase: 'idle',
      activePlan: [],
      retries: 0,
      pendingTasks: [],
      metrics: {
        totalTimeMs: 0,
        toolCallsCount: 0,
        recursionDepth: 0
      }
    }
  }
}

export const globalAgentRuntime = new AgentRuntimeManager()
