import type { CognitiveBenchmarkFrame, Engram, SimulationFrame } from './types'

export interface BenchmarkExpectations {
  expectedEngramKeywords?: string[]
  forbiddenEngramKeywords?: string[]
  expectedBehavior?: Partial<{
    minSpecificity: number
    minInitiative: number
    maxVerbosity: number
  }>
}

export interface CognitiveBenchmarkSummary extends CognitiveBenchmarkFrame {
  frames: number
  passed: boolean
}

export class CognitiveBenchmarkSystem {
  scoreFrame(frame: SimulationFrame, expectations: BenchmarkExpectations = {}): CognitiveBenchmarkFrame {
    const expected = expectations.expectedEngramKeywords ?? []
    const forbidden = expectations.forbiddenEngramKeywords ?? []
    const activeContent = frame.activated.map(item => item.engram.content.toLowerCase()).join(' ')
    const allContent = frame.engrams.map(item => item.content.toLowerCase()).join(' ')

    const recall = expected.length === 0
      ? 1
      : expected.filter(keyword => activeContent.includes(keyword.toLowerCase()) || allContent.includes(keyword.toLowerCase())).length / expected.length

    const falseActivations = forbidden.filter(keyword => activeContent.includes(keyword.toLowerCase())).length
    const falseActivationRate = forbidden.length === 0 ? 0 : falseActivations / forbidden.length

    const contradictionHandling = scoreContradictionHandling(frame.engrams)
    const memoryPersistence = frame.engrams.length === 0
      ? 1
      : frame.engrams.filter(engram => engram.confidence > 0.2).length / frame.engrams.length
    const behavioralAdaptationScore = scoreBehavior(frame, expectations)
    const consistencyScore = Math.max(0, 1 - behaviorVolatility(frame))

    return {
      recall: round(recall),
      consistencyScore: round(consistencyScore),
      contradictionHandling: round(contradictionHandling),
      memoryPersistence: round(memoryPersistence),
      behavioralAdaptationScore: round(behavioralAdaptationScore),
      falseActivationRate: round(falseActivationRate),
    }
  }

  summarize(frames: SimulationFrame[], expectations: BenchmarkExpectations = {}): CognitiveBenchmarkSummary {
    if (frames.length === 0) {
      return {
        frames: 0,
        passed: false,
        recall: 0,
        consistencyScore: 0,
        contradictionHandling: 0,
        memoryPersistence: 0,
        behavioralAdaptationScore: 0,
        falseActivationRate: 1,
      }
    }
    const scored = frames.map(frame => frame.metrics ?? this.scoreFrame(frame, expectations))
    const summary = average(scored)
    return {
      ...summary,
      frames: frames.length,
      passed: summary.recall >= 0.65 && summary.falseActivationRate <= 0.35 && summary.contradictionHandling >= 0.5,
    }
  }
}

function scoreContradictionHandling(engrams: Engram[]): number {
  const conflicted = engrams.filter(engram => engram.conflictsWith.length > 0)
  if (conflicted.length === 0) return 1
  const managed = conflicted.filter(engram => engram.contradictionScore < 0.8 && engram.confidence < 0.9)
  return managed.length / conflicted.length
}

function scoreBehavior(frame: SimulationFrame, expectations: BenchmarkExpectations): number {
  let score = 1
  if (expectations.expectedBehavior?.minSpecificity !== undefined) {
    score *= frame.behavior.specificity >= expectations.expectedBehavior.minSpecificity ? 1 : frame.behavior.specificity
  }
  if (expectations.expectedBehavior?.minInitiative !== undefined) {
    score *= frame.behavior.initiativeLevel >= expectations.expectedBehavior.minInitiative ? 1 : frame.behavior.initiativeLevel
  }
  if (expectations.expectedBehavior?.maxVerbosity !== undefined) {
    score *= frame.behavior.verbosity <= expectations.expectedBehavior.maxVerbosity ? 1 : 1 - frame.behavior.verbosity
  }
  return Math.max(0, Math.min(1, score))
}

function behaviorVolatility(frame: SimulationFrame): number {
  const active = frame.activated.length
  if (active <= 1) return 0
  const scores = frame.activated.map(item => item.score)
  const max = Math.max(...scores)
  const min = Math.min(...scores)
  return Math.min(1, max - min)
}

function average(frames: CognitiveBenchmarkFrame[]): CognitiveBenchmarkFrame {
  const base: CognitiveBenchmarkFrame = {
    recall: 0,
    consistencyScore: 0,
    contradictionHandling: 0,
    memoryPersistence: 0,
    behavioralAdaptationScore: 0,
    falseActivationRate: 0,
  }
  for (const frame of frames) {
    base.recall += frame.recall
    base.consistencyScore += frame.consistencyScore
    base.contradictionHandling += frame.contradictionHandling
    base.memoryPersistence += frame.memoryPersistence
    base.behavioralAdaptationScore += frame.behavioralAdaptationScore
    base.falseActivationRate += frame.falseActivationRate
  }
  const count = frames.length
  return {
    recall: round(base.recall / count),
    consistencyScore: round(base.consistencyScore / count),
    contradictionHandling: round(base.contradictionHandling / count),
    memoryPersistence: round(base.memoryPersistence / count),
    behavioralAdaptationScore: round(base.behavioralAdaptationScore / count),
    falseActivationRate: round(base.falseActivationRate / count),
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
