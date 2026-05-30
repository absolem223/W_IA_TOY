import { ScenarioRunner, type CognitiveScenario, type ScenarioRunResult } from './ScenarioRunner'

export interface RegressionExpectation {
  minRecall?: number
  minConsistency?: number
  maxFalseActivationRate?: number
  minBehavioralAdaptation?: number
}

export interface AutoTestResult {
  passed: boolean
  runs: ScenarioRunResult[]
  failures: string[]
  exportJson: string
}

export class AutoTestHarness {
  private runner = new ScenarioRunner()

  run(scenarios: CognitiveScenario[], expectations: RegressionExpectation = {}): AutoTestResult {
    const runs = scenarios.map(scenario => this.runner.run(scenario))
    const failures: string[] = []

    for (const run of runs) {
      const metric = run.benchmark
      if (metric.recall < (expectations.minRecall ?? 0.55)) failures.push(`${run.scenarioId}: recall ${metric.recall}`)
      if (metric.consistencyScore < (expectations.minConsistency ?? 0.45)) failures.push(`${run.scenarioId}: consistency ${metric.consistencyScore}`)
      if (metric.falseActivationRate > (expectations.maxFalseActivationRate ?? 0.45)) failures.push(`${run.scenarioId}: false activation ${metric.falseActivationRate}`)
      if (metric.behavioralAdaptationScore < (expectations.minBehavioralAdaptation ?? 0.45)) failures.push(`${run.scenarioId}: adaptation ${metric.behavioralAdaptationScore}`)
    }

    return {
      passed: failures.length === 0,
      runs,
      failures,
      exportJson: JSON.stringify({ passed: failures.length === 0, failures, runs }, null, 2),
    }
  }

  compareSnapshots(a: ScenarioRunResult, b: ScenarioRunResult): { changedFrames: number; confidenceDelta: number } {
    const length = Math.min(a.snapshots.length, b.snapshots.length)
    let changedFrames = 0
    let confidenceDelta = 0
    for (let i = 0; i < length; i++) {
      const left = a.snapshots[i].engrams.reduce((sum, engram) => sum + engram.confidence, 0)
      const right = b.snapshots[i].engrams.reduce((sum, engram) => sum + engram.confidence, 0)
      const delta = Math.abs(left - right)
      if (delta > 0.001) changedFrames++
      confidenceDelta += delta
    }
    return {
      changedFrames,
      confidenceDelta: Math.round(confidenceDelta * 1000) / 1000,
    }
  }
}
