import type { CognitiveEvent } from './types'

type Listener = (event: CognitiveEvent) => void

export class CognitiveEventBus {
  private events: CognitiveEvent[] = []
  private listeners: Listener[] = []

  emit(type: CognitiveEvent['type'], payload: Record<string, unknown>, timestamp = new Date()): CognitiveEvent {
    const event: CognitiveEvent = {
      id: `evt_${timestamp.getTime()}_${this.events.length + 1}`,
      type,
      timestamp: timestamp.toISOString(),
      payload,
    }
    this.events.push(event)
    for (const listener of this.listeners) listener(event)
    return event
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(item => item !== listener)
    }
  }

  getEvents(): CognitiveEvent[] {
    return [...this.events]
  }

  drain(): CognitiveEvent[] {
    const snapshot = this.getEvents()
    this.events = []
    return snapshot
  }
}
