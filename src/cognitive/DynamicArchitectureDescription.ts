import type { SelfKnowledgeReport } from './SelfKnowledgeSubsystem'
import type { CognitiveStateReport } from './CognitiveStateReporter'
import type { ConstraintReport } from './ConstraintAwareness'

export interface ArchitectureDescription {
  system: string
  mode: string
  summary: string
  activeModules: string[]
  cognitivePipeline: string[]
  memoryFlow: string[]
  providers: string[]
  constraints: string[]
  currentState: {
    activeEngrams: number
    traits: number
    contradictions: number
    confidenceAverage: number
  }
}

export class DynamicArchitectureDescription {
  describe(input: {
    selfKnowledge: SelfKnowledgeReport
    state: CognitiveStateReport
    constraints: ConstraintReport
  }): ArchitectureDescription {
    return {
      system: input.selfKnowledge.runtime.systemName,
      mode: input.selfKnowledge.runtime.mode,
      summary: 'Isolated experimental cognitive runtime for engram activation, behavioral adaptation, reflection, and observability.',
      activeModules: input.selfKnowledge.activeModules.map(module => module.label),
      cognitivePipeline: [
        'conversation turn',
        'feedback detection',
        'temporal decay',
        'context activation',
        'behavior adaptation',
        'event emission',
        'snapshot/report generation',
      ],
      memoryFlow: [
        'engram creation',
        'semantic embedding',
        'activation scoring',
        'reinforcement or confidence adjustment',
        'consolidation/reflection in experimental layers',
      ],
      providers: input.selfKnowledge.providers.map(provider => `${provider.label}: ${provider.state}/${provider.connectivity}`),
      constraints: input.constraints.limitations,
      currentState: {
        activeEngrams: input.state.activeEngrams.length,
        traits: input.state.activeTraits.length,
        contradictions: input.state.contradictionCount,
        confidenceAverage: input.state.confidenceAverage,
      },
    }
  }
}
