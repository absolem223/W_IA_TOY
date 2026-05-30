import { ScenarioRunner, type CognitiveScenario, type ScenarioRunResult } from './ScenarioRunner'

export interface LongitudinalSimulationConfig {
  scenario: CognitiveScenario
  weeks: number
  sessionsPerWeek: number
  driftEveryWeeks?: number
}

export interface LongitudinalSimulationResult {
  runs: ScenarioRunResult[]
  combinedFrames: ScenarioRunResult['frames']
}

export class LongitudinalSimulationSuite {
  private runner = new ScenarioRunner()

  run(config: LongitudinalSimulationConfig): LongitudinalSimulationResult {
    const runs: ScenarioRunResult[] = []
    const baseTime = new Date(config.scenario.sessions[0]?.startAt ?? '2026-05-17T00:00:00.000Z')
    for (let week = 0; week < config.weeks; week++) {
      const scenario = shiftScenario(config.scenario, baseTime, week, config.sessionsPerWeek, config.driftEveryWeeks)
      runs.push(this.runner.run(scenario))
    }
    return {
      runs,
      combinedFrames: runs.flatMap(run => run.frames),
    }
  }
}

function shiftScenario(
  scenario: CognitiveScenario,
  baseTime: Date,
  week: number,
  sessionsPerWeek: number,
  driftEveryWeeks?: number,
): CognitiveScenario {
  const weekStart = new Date(baseTime.getTime() + week * 7 * 86_400_000)
  const sessions = scenario.sessions.slice(0, sessionsPerWeek).map((session, index) => ({
    ...session,
    id: `${session.id}_week_${week + 1}_${index + 1}`,
    startAt: new Date(weekStart.getTime() + index * 86_400_000).toISOString(),
    turns: maybeDriftTurns(session.turns, week, driftEveryWeeks),
  }))
  return {
    ...scenario,
    id: `${scenario.id}_week_${week + 1}`,
    sessions,
  }
}

function maybeDriftTurns<T extends { text: string }>(turns: T[], week: number, driftEveryWeeks?: number): T[] {
  if (!driftEveryWeeks || week === 0 || week % driftEveryWeeks !== 0) return turns
  return turns.map(turn => ({
    ...turn,
    text: `${turn.text} ahora con cambio de preferencia temporal`,
  }))
}
