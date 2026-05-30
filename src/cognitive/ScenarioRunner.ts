import { CognitiveBenchmarkSystem, type BenchmarkExpectations, type CognitiveBenchmarkSummary } from './CognitiveBenchmark'
import { ConfidenceContradictionEngine } from './ConfidenceContradictionEngine'
import { EngramManager } from './EngramManager'
import type { CognitiveSnapshot, ConversationTurn, CreateEngramInput, SimulationFrame } from './types'

export interface ScenarioUser {
  id: string
  seedEngrams?: CreateEngramInput[]
}

export interface ScenarioSession {
  id: string
  userId: string
  startAt: string
  turns: Array<Omit<ConversationTurn, 'timestamp'> & { skipMinutes?: number }>
}

export interface CognitiveScenario {
  id: string
  users: ScenarioUser[]
  sessions: ScenarioSession[]
  expectations?: BenchmarkExpectations
  stressRepeat?: number
}

export interface ScenarioRunResult {
  scenarioId: string
  frames: SimulationFrame[]
  snapshots: CognitiveSnapshot[]
  benchmark: CognitiveBenchmarkSummary
  exportJson: string
}

export class ScenarioRunner {
  private benchmark = new CognitiveBenchmarkSystem()
  private contradictions = new ConfidenceContradictionEngine()

  run(scenario: CognitiveScenario): ScenarioRunResult {
    const managers = new Map<string, EngramManager>()
    for (const user of scenario.users) {
      const manager = new EngramManager()
      for (const seed of user.seedEngrams ?? []) manager.createEngram(seed)
      managers.set(user.id, manager)
    }

    const frames: SimulationFrame[] = []
    const snapshots: CognitiveSnapshot[] = []
    let frameNumber = 0
    const repeat = scenario.stressRepeat ?? 1

    for (let cycle = 0; cycle < repeat; cycle++) {
      for (const session of scenario.sessions) {
        const manager = managers.get(session.userId)
        if (!manager) throw new Error(`Unknown scenario user: ${session.userId}`)
        let currentTime = new Date(session.startAt)
        for (const turnInput of session.turns) {
          currentTime = new Date(currentTime.getTime() + (turnInput.skipMinutes ?? 1) * 60_000)
          const turn: ConversationTurn = {
            role: turnInput.role,
            text: turnInput.text,
            timestamp: currentTime,
          }
          const result = manager.processTurn(turn)
          this.contradictions.applyConflicts(manager.store, manager.events, currentTime)
          const frameId = `frame_${String(++frameNumber).padStart(4, '0')}`
          const trace = {
            turnId: frameId,
            query: turn.text,
            timestamp: currentTime.toISOString(),
            activated: result.activated.map(item => ({
              engramId: item.engram.id,
              content: item.engram.content,
              score: item.score,
              reasons: item.reasons,
            })),
          }
          const frame: SimulationFrame = {
            frameId,
            userId: session.userId,
            sessionId: session.id,
            turn,
            activated: result.activated,
            behavior: result.behavior,
            feedback: result.feedback,
            engrams: manager.getEngrams(),
            events: [...result.events, ...manager.events.drain()],
            trace,
          }
          frame.metrics = this.benchmark.scoreFrame(frame, scenario.expectations)
          frames.push(frame)
          snapshots.push({
            frameId,
            userId: session.userId,
            sessionId: session.id,
            timestamp: currentTime.toISOString(),
            engrams: frame.engrams,
            behavior: frame.behavior,
            activeEngramIds: frame.activated.map(item => item.engram.id),
            events: frame.events,
          })
        }
      }
    }

    const benchmark = this.benchmark.summarize(frames, scenario.expectations)
    return {
      scenarioId: scenario.id,
      frames,
      snapshots,
      benchmark,
      exportJson: JSON.stringify({ scenarioId: scenario.id, frames, snapshots, benchmark }, null, 2),
    }
  }
}
