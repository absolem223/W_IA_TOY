import { embedText } from './embedding'
import type { CreateEngramInput, Engram } from './types'

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clone(engram: Engram): Engram {
  return {
    ...engram,
    behavioralEffects: [...engram.behavioralEffects],
    semanticEmbedding: [...engram.semanticEmbedding],
    conflictsWith: [...engram.conflictsWith],
  }
}

export class EngramStore {
  private engrams = new Map<string, Engram>()
  private nextId = 1

  create(input: CreateEngramInput): Engram {
    const now = input.createdAt ?? new Date()
    const engram: Engram = {
      id: `eng_${String(this.nextId++).padStart(4, '0')}`,
      type: input.type,
      memoryKind: input.memoryKind ?? inferMemoryKind(input.type),
      content: input.content,
      confidence: clamp(input.confidence ?? 0.55),
      emotionalWeight: clamp(input.emotionalWeight ?? 0.25),
      reinforcementCount: 0,
      negativeReinforcementCount: 0,
      decayRate: clamp(input.decayRate ?? 0.04),
      behavioralEffects: input.behavioralEffects ?? [],
      semanticEmbedding: embedText(input.content),
      conflictsWith: input.conflictsWith ?? [],
      contradictionScore: clamp(input.contradictionScore ?? 0),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastActivatedAt: null,
    }
    this.engrams.set(engram.id, engram)
    return clone(engram)
  }

  adjustConfidence(id: string, delta: number, timestamp = new Date()): Engram | undefined {
    const engram = this.engrams.get(id)
    if (!engram) return undefined
    engram.confidence = clamp(engram.confidence + delta)
    if (delta < 0) engram.negativeReinforcementCount += 1
    engram.updatedAt = timestamp.toISOString()
    this.engrams.set(id, engram)
    return clone(engram)
  }

  registerConflict(leftId: string, rightId: string, strength: number, timestamp = new Date()): Engram[] {
    const left = this.engrams.get(leftId)
    const right = this.engrams.get(rightId)
    if (!left || !right) return []
    if (!left.conflictsWith.includes(rightId)) left.conflictsWith.push(rightId)
    if (!right.conflictsWith.includes(leftId)) right.conflictsWith.push(leftId)
    left.contradictionScore = clamp(left.contradictionScore + strength)
    right.contradictionScore = clamp(right.contradictionScore + strength)
    left.confidence = clamp(left.confidence - strength * 0.2)
    right.confidence = clamp(right.confidence - strength * 0.2)
    left.updatedAt = timestamp.toISOString()
    right.updatedAt = timestamp.toISOString()
    this.engrams.set(leftId, left)
    this.engrams.set(rightId, right)
    return [clone(left), clone(right)]
  }

  all(): Engram[] {
    return [...this.engrams.values()].map(clone)
  }

  get(id: string): Engram | undefined {
    const engram = this.engrams.get(id)
    return engram ? clone(engram) : undefined
  }

  reinforce(id: string, strength: number, timestamp = new Date()): Engram | undefined {
    const engram = this.engrams.get(id)
    if (!engram) return undefined
    const normalized = clamp(strength)
    engram.confidence = clamp(engram.confidence + normalized * (1 - engram.confidence) * 0.35)
    engram.emotionalWeight = clamp(engram.emotionalWeight + normalized * 0.08)
    engram.reinforcementCount += 1
    engram.updatedAt = timestamp.toISOString()
    this.engrams.set(id, engram)
    return clone(engram)
  }

  degrade(timestamp = new Date()): Engram[] {
    const changed: Engram[] = []
    for (const engram of this.engrams.values()) {
      const lastUpdate = new Date(engram.updatedAt).getTime()
      const ageDays = Math.max(0, (timestamp.getTime() - lastUpdate) / 86_400_000)
      if (ageDays === 0) continue
      const temporalDecay = Math.exp(-engram.decayRate * ageDays)
      engram.confidence = clamp(engram.confidence * temporalDecay)
      engram.emotionalWeight = clamp(engram.emotionalWeight * Math.exp(-engram.decayRate * ageDays * 1.5))
      engram.contradictionScore = clamp(engram.contradictionScore * Math.exp(-engram.decayRate * ageDays * 0.5))
      engram.updatedAt = timestamp.toISOString()
      changed.push(clone(engram))
    }
    return changed
  }

  markActivated(id: string, timestamp = new Date()): Engram | undefined {
    const engram = this.engrams.get(id)
    if (!engram) return undefined
    engram.lastActivatedAt = timestamp.toISOString()
    engram.updatedAt = timestamp.toISOString()
    this.engrams.set(id, engram)
    return clone(engram)
  }

  import(engrams: Engram[]): void {
    this.engrams.clear()
    this.nextId = 1
    for (const engram of engrams) {
      this.engrams.set(engram.id, clone(engram))
      const numericId = Number(engram.id.replace(/^eng_/, ''))
      if (Number.isFinite(numericId)) this.nextId = Math.max(this.nextId, numericId + 1)
    }
  }
}

function inferMemoryKind(type: CreateEngramInput['type']): Engram['memoryKind'] {
  if (type === 'episodic_event') return 'episodic'
  if (type === 'semantic_fact') return 'semantic'
  if (type === 'behavioral_pattern' || type === 'preference_signal') return 'behavioral'
  if (type === 'relational_state') return 'identity'
  return 'semantic'
}
