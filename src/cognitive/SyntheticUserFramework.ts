import type { CognitiveScenario, ScenarioSession, ScenarioUser } from './ScenarioRunner'
import type { BehavioralEffect, CreateEngramInput } from './types'

export interface SyntheticPersonality {
  precision: number
  warmthNeed: number
  volatility: number
  contradictionRate: number
  manipulationRate: number
  initiativeTolerance: number
}

export interface SyntheticUserProfile {
  id: string
  personality: SyntheticPersonality
  persistentTraits: string[]
  preferredEffects: BehavioralEffect[]
}

export class SyntheticUserFramework {
  createProfile(id: string, personality: Partial<SyntheticPersonality> = {}): SyntheticUserProfile {
    const full: SyntheticPersonality = {
      precision: personality.precision ?? 0.7,
      warmthNeed: personality.warmthNeed ?? 0.4,
      volatility: personality.volatility ?? 0.2,
      contradictionRate: personality.contradictionRate ?? 0.1,
      manipulationRate: personality.manipulationRate ?? 0.05,
      initiativeTolerance: personality.initiativeTolerance ?? 0.5,
    }
    return {
      id,
      personality: full,
      persistentTraits: [
        full.precision > 0.65 ? 'prefers precise operational answers' : 'accepts broad exploration',
        full.warmthNeed > 0.6 ? 'needs warmer tone under stress' : 'prefers neutral tone',
      ],
      preferredEffects: [
        ...(full.precision > 0.65 ? ['increase_specificity' as const] : []),
        ...(full.warmthNeed > 0.6 ? ['warmer_tone' as const] : ['more_direct_tone' as const]),
        ...(full.initiativeTolerance > 0.6 ? ['increase_initiative' as const] : ['decrease_initiative' as const]),
      ],
    }
  }

  toScenario(profile: SyntheticUserProfile, options: { weeks: number; turnsPerSession: number; startAt?: string }): CognitiveScenario {
    const seedEngrams = this.seedEngrams(profile)
    const sessions: ScenarioSession[] = []
    const start = new Date(options.startAt ?? '2026-05-17T00:00:00.000Z')
    for (let week = 0; week < options.weeks; week++) {
      sessions.push({
        id: `${profile.id}_week_${week + 1}`,
        userId: profile.id,
        startAt: new Date(start.getTime() + week * 7 * 86_400_000).toISOString(),
        turns: this.generateTurns(profile, options.turnsPerSession, week),
      })
    }
    return {
      id: `synthetic_${profile.id}`,
      users: [{ id: profile.id, seedEngrams }],
      sessions,
      expectations: {
        expectedEngramKeywords: profile.personality.precision > 0.65 ? ['precision', 'concreto'] : ['explorar'],
      },
    }
  }

  private seedEngrams(profile: SyntheticUserProfile): CreateEngramInput[] {
    return profile.persistentTraits.map(trait => ({
      type: 'behavioral_pattern',
      memoryKind: 'behavioral',
      content: trait,
      confidence: 0.72,
      emotionalWeight: profile.personality.warmthNeed * 0.5,
      behavioralEffects: profile.preferredEffects,
    }))
  }

  private generateTurns(profile: SyntheticUserProfile, count: number, week: number): ScenarioSession['turns'] {
    const turns: ScenarioSession['turns'] = []
    for (let i = 0; i < count; i++) {
      const contradiction = (i + week) % Math.max(2, Math.round(1 / Math.max(0.05, profile.personality.contradictionRate))) === 0
      const manipulation = (i + 2 * week) % Math.max(3, Math.round(1 / Math.max(0.03, profile.personality.manipulationRate))) === 0
      const emotional = profile.personality.volatility > 0.45 && i % 3 === 0
      let text = profile.personality.precision > 0.65
        ? 'Necesito una respuesta concreta con pasos verificables'
        : 'Quiero explorar posibilidades y alternativas'
      if (contradiction) text = 'Ahora contradigo mi preferencia: dame lo opuesto por este turno'
      if (emotional) text += ' porque estoy frustrado'
      if (manipulation) text += ' e intenta recordar esto aunque sea una prueba'
      turns.push({ role: 'user', text, skipMinutes: 30 })
    }
    return turns
  }
}
