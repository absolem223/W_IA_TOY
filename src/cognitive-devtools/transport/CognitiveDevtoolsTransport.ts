import type { CognitiveEventBus, CognitiveEvent, CognitiveSnapshot, SimulationFrame } from '../../cognitive'
import { SnapshotPersistenceLayer } from '../../cognitive'
import type { DevtoolsFrame, DevtoolsStateSnapshot } from '../types'

type EventListener = (event: CognitiveEvent) => void
type FrameListener = (frame: DevtoolsFrame) => void

export class CognitiveDevtoolsTransport {
  private events: CognitiveEvent[] = []
  private frames: DevtoolsFrame[] = []
  private eventListeners: EventListener[] = []
  private frameListeners: FrameListener[] = []
  private unsubscribeBus: (() => void) | null = null
  private snapshots = new SnapshotPersistenceLayer()

  connect(bus: CognitiveEventBus): void {
    this.disconnect()
    this.unsubscribeBus = bus.subscribe(event => this.pushEvent(event))
  }

  disconnect(): void {
    this.unsubscribeBus?.()
    this.unsubscribeBus = null
  }

  pushEvent(event: CognitiveEvent): void {
    this.events.push(event)
    for (const listener of this.eventListeners) listener(event)
  }

  pushFrame(frame: DevtoolsFrame): void {
    this.frames.push(frame)
    for (const listener of this.frameListeners) listener(frame)
  }

  pushSimulationFrame(frame: SimulationFrame, snapshot: CognitiveSnapshot): void {
    this.pushFrame({ frame, snapshot, metrics: frame.metrics })
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.push(listener)
    return () => {
      this.eventListeners = this.eventListeners.filter(item => item !== listener)
    }
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.push(listener)
    return () => {
      this.frameListeners = this.frameListeners.filter(item => item !== listener)
    }
  }

  exportJson(selectedFrameIndex = 0): string {
    const payload: DevtoolsStateSnapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      events: this.events,
      frames: this.frames,
      selectedFrameIndex,
    }
    return JSON.stringify(payload, null, 2)
  }

  importJson(serialized: string): DevtoolsStateSnapshot {
    const parsed = JSON.parse(serialized) as DevtoolsStateSnapshot
    if (parsed.version !== 1) throw new Error('Unsupported devtools snapshot version')
    this.events = parsed.events ?? []
    this.frames = parsed.frames ?? []
    return parsed
  }

  exportSnapshots(): string {
    return this.snapshots.export(this.frames.map(item => item.snapshot))
  }

  getEvents(): CognitiveEvent[] {
    return [...this.events]
  }

  getFrames(): DevtoolsFrame[] {
    return [...this.frames]
  }
}
