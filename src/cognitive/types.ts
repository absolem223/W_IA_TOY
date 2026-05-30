export type EngramType =
  | 'episodic_event'
  | 'semantic_fact'
  | 'behavioral_pattern'
  | 'relational_state'
  | 'preference_signal'

export type MemoryKind =
  | 'episodic'
  | 'semantic'
  | 'behavioral'
  | 'emotional'
  | 'identity'
  | 'procedural'

export type BehavioralEffect =
  | 'increase_verbosity'
  | 'decrease_verbosity'
  | 'warmer_tone'
  | 'more_direct_tone'
  | 'increase_specificity'
  | 'reduce_repetition'
  | 'increase_initiative'
  | 'decrease_initiative'

export interface Engram {
  id: string
  type: EngramType
  memoryKind: MemoryKind
  content: string
  confidence: number
  emotionalWeight: number
  reinforcementCount: number
  negativeReinforcementCount: number
  decayRate: number
  behavioralEffects: BehavioralEffect[]
  semanticEmbedding: number[]
  conflictsWith: string[]
  contradictionScore: number
  createdAt: string
  updatedAt: string
  lastActivatedAt: string | null
}

export interface CreateEngramInput {
  type: EngramType
  content: string
  confidence?: number
  emotionalWeight?: number
  memoryKind?: MemoryKind
  decayRate?: number
  behavioralEffects?: BehavioralEffect[]
  conflictsWith?: string[]
  contradictionScore?: number
  createdAt?: Date
}

export interface ActivationQuery {
  text: string
  timestamp?: Date
  limit?: number
}

export interface ActivationScore {
  engram: Engram
  score: number
  reasons: {
    semanticSimilarity: number
    confidence: number
    emotionalBoost: number
    recencyMultiplier: number
  }
}

export interface ActivationTrace {
  turnId: string
  query: string
  timestamp: string
  activated: Array<{
    engramId: string
    content: string
    score: number
    reasons: ActivationScore['reasons']
  }>
}

export interface BehaviorState {
  verbosity: number
  tone: 'neutral' | 'warm' | 'direct'
  specificity: number
  repetitionPenalty: number
  initiativeLevel: number
}

export interface FeedbackSignal {
  type:
    | 'continuity'
    | 'abrupt_topic_change'
    | 'short_message'
    | 'abandonment'
    | 'correction'
  strength: number
  polarity: 'positive' | 'negative' | 'neutral'
  reason: string
}

export interface CognitiveEvent {
  id: string
  type:
    | 'engram.created'
    | 'engram.activated'
    | 'engram.reinforced'
    | 'engram.degraded'
    | 'engram.confidence_adjusted'
    | 'engram.conflict_detected'
    | 'engram.consolidated'
    | 'reflection.generated'
    | 'semantic_graph.linked'
    | 'policy.applied'
    | 'shadow_llm.context_built'
    | 'behavior.updated'
    | 'feedback.detected'
    | 'simulation.turn'
    | 'scenario.started'
    | 'scenario.completed'
    | 'benchmark.completed'
  timestamp: string
  payload: Record<string, unknown>
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  text: string
  timestamp?: Date
}

export interface SimulationFrame {
  frameId?: string
  userId?: string
  sessionId?: string
  turn: ConversationTurn
  activated: ActivationScore[]
  behavior: BehaviorState
  feedback: FeedbackSignal[]
  engrams: Engram[]
  events: CognitiveEvent[]
  trace?: ActivationTrace
  metrics?: CognitiveBenchmarkFrame
}

export interface CognitiveSnapshot {
  frameId: string
  userId: string
  sessionId: string
  timestamp: string
  engrams: Engram[]
  behavior: BehaviorState
  activeEngramIds: string[]
  events: CognitiveEvent[]
}

export interface CognitiveBenchmarkFrame {
  recall: number
  consistencyScore: number
  contradictionHandling: number
  memoryPersistence: number
  behavioralAdaptationScore: number
  falseActivationRate: number
}

export interface ReflectionHypothesis {
  id: string
  label: string
  confidence: number
  evidenceEngramIds: string[]
  summary: string
}

export interface CognitiveReflection {
  id: string
  timestamp: string
  summary: string
  recurrentPatterns: ReflectionHypothesis[]
  behavioralChanges: string[]
  longitudinalInsights: string[]
}
