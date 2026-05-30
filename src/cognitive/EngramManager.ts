import { BehavioralAdaptationEngine, defaultBehavior } from './BehavioralAdaptationEngine'
import { CognitiveEventBus } from './CognitiveEventBus'
import { ContextActivationEngine } from './ContextActivationEngine'
import { EngramStore } from './EngramStore'
import { ReinforcementEngine } from './ReinforcementEngine'
import type {
  ActivationScore,
  BehaviorState,
  CognitiveEvent,
  ConversationTurn,
  CreateEngramInput,
  Engram,
  FeedbackSignal,
} from './types'

export interface ProcessTurnResult {
  activated: ActivationScore[]
  behavior: BehaviorState
  feedback: FeedbackSignal[]
  events: CognitiveEvent[]
}

export class EngramManager {
  readonly store: EngramStore
  readonly events: CognitiveEventBus
  private activation: ContextActivationEngine
  private behavior: BehavioralAdaptationEngine
  private reinforcement: ReinforcementEngine
  private previousUserTurn: ConversationTurn | null = null
  private lastActivated: ActivationScore[] = []

  constructor(options?: {
    store?: EngramStore
    events?: CognitiveEventBus
    activation?: ContextActivationEngine
    behavior?: BehavioralAdaptationEngine
    reinforcement?: ReinforcementEngine
  }) {
    this.store = options?.store ?? new EngramStore()
    this.events = options?.events ?? new CognitiveEventBus()
    this.activation = options?.activation ?? new ContextActivationEngine()
    this.behavior = options?.behavior ?? new BehavioralAdaptationEngine()
    this.reinforcement = options?.reinforcement ?? new ReinforcementEngine()
  }

  createEngram(input: CreateEngramInput): Engram {
    const engram = this.store.create(input)
    this.events.emit('engram.created', { engram })
    return engram
  }

  processTurn(turn: ConversationTurn): ProcessTurnResult {
    const timestamp = turn.timestamp ?? new Date()
    const feedback = this.reinforcement.detectFeedback(this.previousUserTurn, turn)
    if (feedback.length > 0) {
      this.events.emit('feedback.detected', { feedback, turn }, timestamp)
      this.reinforcement.applyFeedback(this.store, this.lastActivated, feedback, timestamp)
      for (const activation of this.lastActivated) {
        const updated = this.store.get(activation.engram.id)
        if (updated && updated.reinforcementCount !== activation.engram.reinforcementCount) {
          this.events.emit('engram.reinforced', { engram: updated, feedback }, timestamp)
        }
      }
    }

    const degraded = this.store.degrade(timestamp)
    for (const engram of degraded) {
      this.events.emit('engram.degraded', { engram }, timestamp)
    }

    const activated = this.activation.activate(this.store.all(), {
      text: turn.text,
      timestamp,
      limit: 5,
    })

    for (const item of activated) {
      this.store.markActivated(item.engram.id, timestamp)
      this.events.emit('engram.activated', {
        engramId: item.engram.id,
        score: item.score,
        reasons: item.reasons,
      }, timestamp)
    }

    const behavior = this.behavior.compose(activated, defaultBehavior())
    this.events.emit('behavior.updated', { behavior, activated: activated.map(item => item.engram.id) }, timestamp)
    this.events.emit('simulation.turn', { turn }, timestamp)

    if (turn.role === 'user') this.previousUserTurn = turn
    this.lastActivated = activated

    return {
      activated,
      behavior,
      feedback,
      events: this.events.drain(),
    }
  }

  getEngrams(): Engram[] {
    return this.store.all()
  }
}
