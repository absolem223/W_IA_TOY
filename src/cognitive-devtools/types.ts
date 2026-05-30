import type {
  CognitiveBenchmarkFrame,
  CognitiveEvent,
  CognitiveSnapshot,
  SimulationFrame,
} from '../cognitive'
import type { CognitiveHealthReport } from '../cognitive/CognitiveHealthMonitor'
import type { DecisionExplanation } from '../cognitive/DecisionExplanationLayer'
import type { SemanticGraph } from '../cognitive/SemanticGraphEngine'

export interface DevtoolsFrame {
  frame: SimulationFrame
  snapshot: CognitiveSnapshot
  health?: CognitiveHealthReport
  metrics?: CognitiveBenchmarkFrame
  decision?: DecisionExplanation
  graph?: SemanticGraph
}

export interface DevtoolsStateSnapshot {
  version: 1
  exportedAt: string
  events: CognitiveEvent[]
  frames: DevtoolsFrame[]
  selectedFrameIndex: number
}

export interface EventFilter {
  query: string
  eventTypes: string[]
}
