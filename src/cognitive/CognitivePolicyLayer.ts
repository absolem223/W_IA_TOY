import type { CreateEngramInput, Engram, FeedbackSignal } from './types'

export interface CognitivePolicyConfig {
  minConfidenceToActivate: number
  minConfidenceToConsolidate: number
  maxContradictionToActivate: number
  privacyBlockedTerms: string[]
  maxEngramsPerKind: number
  adaptiveQuestioningThreshold: number
}

export interface PolicyDecision {
  allowed: boolean
  reason: string
}

export class CognitivePolicyLayer {
  constructor(private config: CognitivePolicyConfig = defaultPolicy()) {}

  canCreate(input: CreateEngramInput): PolicyDecision {
    const lowered = input.content.toLowerCase()
    const blocked = this.config.privacyBlockedTerms.find(term => lowered.includes(term))
    if (blocked) return { allowed: false, reason: `privacy blocked term: ${blocked}` }
    if ((input.confidence ?? 0.55) < 0.1) return { allowed: false, reason: 'confidence below creation floor' }
    return { allowed: true, reason: 'allowed' }
  }

  canActivate(engram: Engram): PolicyDecision {
    if (engram.confidence < this.config.minConfidenceToActivate) return { allowed: false, reason: 'confidence below activation threshold' }
    if (engram.contradictionScore > this.config.maxContradictionToActivate) return { allowed: false, reason: 'contradiction above activation threshold' }
    return { allowed: true, reason: 'allowed' }
  }

  shouldAskClarifyingQuestion(signals: FeedbackSignal[]): boolean {
    const negative = signals.filter(signal => signal.polarity === 'negative').reduce((sum, signal) => sum + signal.strength, 0)
    return negative >= this.config.adaptiveQuestioningThreshold
  }

  retentionCandidates(engrams: Engram[]): Engram[] {
    const byKind = new Map<string, Engram[]>()
    for (const engram of engrams) {
      const bucket = byKind.get(engram.memoryKind) ?? []
      bucket.push(engram)
      byKind.set(engram.memoryKind, bucket)
    }
    const candidates: Engram[] = []
    for (const bucket of byKind.values()) {
      const sorted = [...bucket].sort((a, b) => a.confidence - b.confidence)
      candidates.push(...sorted.slice(0, Math.max(0, sorted.length - this.config.maxEngramsPerKind)))
    }
    return candidates
  }
}

function defaultPolicy(): CognitivePolicyConfig {
  return {
    minConfidenceToActivate: 0.15,
    minConfidenceToConsolidate: 0.55,
    maxContradictionToActivate: 0.75,
    privacyBlockedTerms: ['password', 'token', 'api key', 'secreto', 'contraseña'],
    maxEngramsPerKind: 50,
    adaptiveQuestioningThreshold: 0.9,
  }
}
