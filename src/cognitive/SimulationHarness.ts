import { EngramManager } from './EngramManager'
import type { ConversationTurn, CreateEngramInput, SimulationFrame } from './types'

export interface SimulationInput {
  seedEngrams?: CreateEngramInput[]
  turns: ConversationTurn[]
}

export interface SimulationReplay {
  frames: SimulationFrame[]
  finalEngrams: ReturnType<EngramManager['getEngrams']>
}

export class SimulationHarness {
  private manager: EngramManager

  constructor(manager = new EngramManager()) {
    this.manager = manager
  }

  run(input: SimulationInput): SimulationReplay {
    for (const seed of input.seedEngrams ?? []) {
      this.manager.createEngram(seed)
    }

    const frames: SimulationFrame[] = []
    for (const turn of input.turns) {
      const result = this.manager.processTurn(turn)
      frames.push({
        turn,
        activated: result.activated,
        behavior: result.behavior,
        feedback: result.feedback,
        engrams: this.manager.getEngrams(),
        events: result.events,
      })
    }

    return {
      frames,
      finalEngrams: this.manager.getEngrams(),
    }
  }
}
