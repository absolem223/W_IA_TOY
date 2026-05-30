import { keywordOverlap, tokenize } from './embedding'
import type { ActivationScore, ConversationTurn, FeedbackSignal } from './types'
import { EngramStore } from './EngramStore'

const CORRECTION_PATTERNS = [
  /\b(no|eso no|asi no|así no)\b/i,
  /\b(mas|más) (corto|largo|profundo|concreto|directo)\b/i,
  /\bno quiero\b/i,
  /\bte pedi|te pedí\b/i,
]

export class ReinforcementEngine {
  detectFeedback(previous: ConversationTurn | null, current: ConversationTurn): FeedbackSignal[] {
    if (current.role !== 'user') return []

    const signals: FeedbackSignal[] = []
    const currentTokens = tokenize(current.text)
    const isShort = currentTokens.length > 0 && currentTokens.length <= 3
    if (isShort) {
      signals.push({
        type: 'short_message',
        strength: 0.35,
        polarity: 'neutral',
        reason: 'User sent a very short message; weak signal for low engagement or concise style.',
      })
    }

    const hasCorrection = CORRECTION_PATTERNS.some(pattern => pattern.test(current.text))
    if (hasCorrection) {
      signals.push({
        type: 'correction',
        strength: 0.85,
        polarity: 'negative',
        reason: 'User text contains correction or style rejection pattern.',
      })
    }

    if (!previous) return signals

    const overlap = keywordOverlap(previous.text, current.text)
    if (overlap >= 0.18 && !hasCorrection) {
      signals.push({
        type: 'continuity',
        strength: Math.min(0.8, 0.35 + overlap),
        polarity: 'positive',
        reason: 'User continued with semantically related content after the previous turn.',
      })
    }

    if (overlap < 0.04 && currentTokens.length >= 5) {
      signals.push({
        type: 'abrupt_topic_change',
        strength: 0.45,
        polarity: 'negative',
        reason: 'User moved to an unrelated topic with enough text to suggest topic abandonment.',
      })
    }

    if (overlap < 0.04 && currentTokens.length <= 2) {
      signals.push({
        type: 'abandonment',
        strength: 0.4,
        polarity: 'negative',
        reason: 'User gave a minimal unrelated reply after the previous turn.',
      })
    }

    return signals
  }

  applyFeedback(store: EngramStore, activated: ActivationScore[], signals: FeedbackSignal[], timestamp = new Date()): void {
    const positiveStrength = signals
      .filter(signal => signal.polarity === 'positive')
      .reduce((sum, signal) => sum + signal.strength, 0)
    const negativeStrength = signals
      .filter(signal => signal.polarity === 'negative')
      .reduce((sum, signal) => sum + signal.strength, 0)

    if (positiveStrength <= 0 && negativeStrength <= 0) return

    for (const activation of activated) {
      if (positiveStrength > negativeStrength) {
        store.reinforce(activation.engram.id, Math.min(1, positiveStrength * activation.score), timestamp)
      }
    }
  }
}
