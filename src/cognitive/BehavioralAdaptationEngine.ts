import type { ActivationScore, BehaviorState, BehavioralEffect } from './types'

const DEFAULT_BEHAVIOR: BehaviorState = {
  verbosity: 0.5,
  tone: 'neutral',
  specificity: 0.5,
  repetitionPenalty: 0.2,
  initiativeLevel: 0.4,
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export class BehavioralAdaptationEngine {
  compose(activated: ActivationScore[], base: BehaviorState = DEFAULT_BEHAVIOR): BehaviorState {
    const state: BehaviorState = { ...base }
    let warmTone = 0
    let directTone = 0

    for (const activation of activated) {
      for (const effect of activation.engram.behavioralEffects) {
        const delta = activation.score
        applyEffect(state, effect, delta)
        if (effect === 'warmer_tone') warmTone += delta
        if (effect === 'more_direct_tone') directTone += delta
      }
    }

    state.verbosity = clamp(state.verbosity)
    state.specificity = clamp(state.specificity)
    state.repetitionPenalty = clamp(state.repetitionPenalty)
    state.initiativeLevel = clamp(state.initiativeLevel)
    state.tone = directTone > warmTone && directTone > 0 ? 'direct' : warmTone > 0 ? 'warm' : state.tone

    return state
  }
}

function applyEffect(state: BehaviorState, effect: BehavioralEffect, score: number): void {
  if (effect === 'increase_verbosity') state.verbosity += 0.22 * score
  if (effect === 'decrease_verbosity') state.verbosity -= 0.24 * score
  if (effect === 'increase_specificity') state.specificity += 0.3 * score
  if (effect === 'reduce_repetition') state.repetitionPenalty += 0.35 * score
  if (effect === 'increase_initiative') state.initiativeLevel += 0.22 * score
  if (effect === 'decrease_initiative') state.initiativeLevel -= 0.24 * score
}

export function defaultBehavior(): BehaviorState {
  return { ...DEFAULT_BEHAVIOR }
}
