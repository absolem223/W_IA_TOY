import type { CognitiveSessionType, IntentState } from './types'

export class CognitiveSessionManager {
  private currentState: IntentState = {
    activeObjectives: [],
    openThreads: [],
    currentFocus: 'general',
    sessionType: 'general'
  }

  setSessionType(type: CognitiveSessionType) {
    this.currentState.sessionType = type
    console.log(`[COGNITIVE] Session type changed to: ${type}`)
  }

  updateIntent(focus: string, objectives: string[]) {
    this.currentState.currentFocus = focus
    this.currentState.activeObjectives = objectives
    console.log(`[COGNITIVE] Intent updated. Focus: ${focus}`)
  }

  getState(): IntentState {
    return this.currentState
  }

  /**
   * Evaluates the current session intent to provide weight multipliers for context assembly.
   */
  getRetrievalWeights(): { trustMultiplier: number, usageMultiplier: number, conceptBoost: number } {
    switch (this.currentState.sessionType) {
      case 'research':
        // Research prioritizes concepts and established trusted sources.
        return { trustMultiplier: 1.5, usageMultiplier: 0.8, conceptBoost: 2.0 }
      case 'coding':
        // Coding prioritizes absolute precision (trust) over repeated usage/exploration.
        return { trustMultiplier: 2.0, usageMultiplier: 0.5, conceptBoost: 1.0 }
      case 'creative':
        // Creative prioritizes wide exploration, rewarding older/different usage patterns.
        return { trustMultiplier: 0.8, usageMultiplier: 1.5, conceptBoost: 1.2 }
      case 'planning':
        // Planning prioritizes high usage (recent active tasks).
        return { trustMultiplier: 1.0, usageMultiplier: 1.8, conceptBoost: 1.5 }
      case 'general':
      default:
        return { trustMultiplier: 1.0, usageMultiplier: 1.0, conceptBoost: 1.0 }
    }
  }
}

export const globalCognitiveSession = new CognitiveSessionManager()
