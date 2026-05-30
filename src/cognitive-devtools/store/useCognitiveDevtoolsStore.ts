import { create } from 'zustand'
import type { CognitiveEvent } from '../../cognitive'
import type { DevtoolsFrame, EventFilter } from '../types'

export interface CognitiveDevtoolsStore {
  events: CognitiveEvent[]
  frames: DevtoolsFrame[]
  selectedFrameIndex: number
  filter: EventFilter
  setEvents(events: CognitiveEvent[]): void
  appendEvent(event: CognitiveEvent): void
  setFrames(frames: DevtoolsFrame[]): void
  appendFrame(frame: DevtoolsFrame): void
  selectFrame(index: number): void
  setFilter(filter: Partial<EventFilter>): void
  reset(): void
}

export const useCognitiveDevtoolsStore = create<CognitiveDevtoolsStore>(set => ({
  events: [],
  frames: [],
  selectedFrameIndex: 0,
  filter: { query: '', eventTypes: [] },
  setEvents: events => set({ events }),
  appendEvent: event => set(state => ({ events: [...state.events, event] })),
  setFrames: frames => set({ frames, selectedFrameIndex: 0 }),
  appendFrame: frame => set(state => ({ frames: [...state.frames, frame] })),
  selectFrame: index => set(state => ({
    selectedFrameIndex: Math.max(0, Math.min(index, Math.max(0, state.frames.length - 1))),
  })),
  setFilter: filter => set(state => ({ filter: { ...state.filter, ...filter } })),
  reset: () => set({ events: [], frames: [], selectedFrameIndex: 0, filter: { query: '', eventTypes: [] } }),
}))
