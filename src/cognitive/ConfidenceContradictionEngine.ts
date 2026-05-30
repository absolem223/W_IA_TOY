import { keywordOverlap } from './embedding'
import { EngramStore } from './EngramStore'
import type { CognitiveEventBus } from './CognitiveEventBus'
import type { Engram } from './types'

const CONTRAST_PAIRS = [
  ['breve', 'detall'],
  ['corto', 'profund'],
  ['directo', 'explor'],
  ['iniciativa', 'pregunt'],
  ['formal', 'casual'],
] as const

export interface ConflictDetection {
  left: Engram
  right: Engram
  strength: number
  reason: string
}

export class ConfidenceContradictionEngine {
  detectConflicts(engrams: Engram[]): ConflictDetection[] {
    const conflicts: ConflictDetection[] = []
    for (let i = 0; i < engrams.length; i++) {
      for (let j = i + 1; j < engrams.length; j++) {
        const left = engrams[i]
        const right = engrams[j]
        if (left.memoryKind !== right.memoryKind) continue
        const overlap = keywordOverlap(left.content, right.content)
        if (overlap < 0.08) continue
        const contrast = this.findContrast(left.content, right.content)
        if (!contrast) continue
        conflicts.push({
          left,
          right,
          strength: Math.min(0.65, 0.25 + overlap),
          reason: `Potential contrast between "${contrast[0]}" and "${contrast[1]}" in related engrams.`,
        })
      }
    }
    return conflicts
  }

  applyConflicts(store: EngramStore, events?: CognitiveEventBus, timestamp = new Date()): ConflictDetection[] {
    const conflicts = this.detectConflicts(store.all())
    for (const conflict of conflicts) {
      const changed = store.registerConflict(conflict.left.id, conflict.right.id, conflict.strength, timestamp)
      events?.emit('engram.conflict_detected', {
        leftId: conflict.left.id,
        rightId: conflict.right.id,
        strength: conflict.strength,
        reason: conflict.reason,
        changed,
      }, timestamp)
    }
    return conflicts
  }

  adjustFromFeedback(store: EngramStore, engramId: string, polarity: 'positive' | 'negative', strength: number, timestamp = new Date()): Engram | undefined {
    const delta = polarity === 'positive' ? strength * 0.12 : -strength * 0.18
    return store.adjustConfidence(engramId, delta, timestamp)
  }

  private findContrast(left: string, right: string): readonly [string, string] | null {
    const a = left.toLowerCase()
    const b = right.toLowerCase()
    return CONTRAST_PAIRS.find(([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))) ?? null
  }
}
