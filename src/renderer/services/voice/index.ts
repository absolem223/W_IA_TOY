/**
 * index.ts — Argos Voice Service: Public API
 *
 * Single import point for all consumers.
 */

// Types
export type { VoiceState, VoiceProvider, VoiceServiceConfig, VoiceSubscription } from './types'

// Abstract base (optional, for provider authors)
export { BaseVoiceProvider } from './VoiceProvider'

// Service
export { VoiceService } from './VoiceService'

// React Context & Hooks
export { VoiceProviderComponent, useVoiceService } from './VoiceContext'

// Providers (Only imported by the root/Context, never by ChatInput)
export { DummyProvider } from './providers/DummyProvider'
export { MediaRecorderProvider } from './providers/MediaRecorderProvider'

