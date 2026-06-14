/**
 * VoiceService.ts — Argos Voice Service: Central Orchestrator
 *
 * VoiceService is the single point of interaction for consumers (UI, hooks).
 * It holds exactly one VoiceProvider at a time and exposes:
 *
 *   - start() / stop()           → delegate to current provider
 *   - subscribeState()           → react to state transitions
 *   - subscribePartialTranscript() → live partial text
 *   - subscribeFinalTranscript() → completed transcript (dispatch to LLM)
 *   - setProvider()              → swap provider at runtime
 *
 * Consumers never interact with providers directly; they only see VoiceService.
 * This makes provider swaps (DummyProvider → WhisperCppProvider) invisible
 * to the rest of the application.
 *
 * Subscriber pattern:
 *   Each subscribe* method returns a { unsubscribe() } object.
 *   Multiple concurrent subscribers are supported per event.
 *   This mirrors standard event emitter patterns without external dependencies.
 */

import type { VoiceProvider, VoiceState, VoiceSubscription } from './types'

type Listener<T> = (value: T) => void

export class VoiceService {
  private _provider:              VoiceProvider
  private _currentState:          VoiceState = 'idle'
  private _providerUnsubs:         VoiceSubscription[] = []

  // Subscriber lists — multiple consumers can subscribe simultaneously.
  private _stateListeners:         Set<Listener<VoiceState>> = new Set()
  private _partialListeners:       Set<Listener<string>>     = new Set()
  private _finalListeners:         Set<Listener<string>>     = new Set()

  constructor(provider: VoiceProvider) {
    this._provider = provider
    this._wireProvider(provider)
  }

  // ── Provider wiring ────────────────────────────────────────────────────
  // Connects the provider's callbacks to this service's broadcast system.
  private _wireProvider(provider: VoiceProvider): void {
    this._unwireProvider()

    this._providerUnsubs = [
      provider.onStateChange((state) => {
        this._currentState = state
        this._stateListeners.forEach(cb => cb(state))
      }),

      provider.onPartialTranscript((text) => {
        this._partialListeners.forEach(cb => cb(text))
      }),

      provider.onFinalTranscript((text) => {
        this._finalListeners.forEach(cb => cb(text))
      })
    ]
  }

  private _unwireProvider(): void {
    this._providerUnsubs.forEach(sub => sub.unsubscribe())
    this._providerUnsubs = []
  }

  // ── Provider hot-swap ──────────────────────────────────────────────────
  // Replaces the current provider. All existing subscribers are preserved
  // and automatically wired to the new provider.
  // Note: You should call stop() before setProvider() if a session is active.
  setProvider(provider: VoiceProvider): void {
    this._provider = provider
    this._wireProvider(provider)
    console.info(`[VoiceService] Provider switched to: ${provider.id}`)
  }

  // ── Getters ────────────────────────────────────────────────────────────
  get providerId(): string {
    return this._provider.id
  }

  get state(): VoiceState {
    return this._currentState
  }

  // ── Control ───────────────────────────────────────────────────────────
  async start(): Promise<void> {
    await this._provider.start()
  }

  async stop(): Promise<void> {
    await this._provider.stop()
  }

  async cancel(): Promise<void> {
    if (typeof this._provider.cancel === 'function') {
      await this._provider.cancel()
    } else {
      await this._provider.stop()
    }
  }


  // ── Subscriptions ──────────────────────────────────────────────────────
  subscribeState(listener: Listener<VoiceState>): VoiceSubscription {
    this._stateListeners.add(listener)
    return {
      unsubscribe: () => this._stateListeners.delete(listener),
    }
  }

  subscribePartialTranscript(listener: Listener<string>): VoiceSubscription {
    this._partialListeners.add(listener)
    return {
      unsubscribe: () => this._partialListeners.delete(listener),
    }
  }

  subscribeFinalTranscript(listener: Listener<string>): VoiceSubscription {
    this._finalListeners.add(listener)
    return {
      unsubscribe: () => this._finalListeners.delete(listener),
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────
  // Call when the consuming component unmounts.
  async destroy(): Promise<void> {
    console.info('[VoiceService] Destroying service and cleaning up resources')

    // 1. Force cancel any active audio/processing session to release hardware or timers
    try {
      await this.cancel()
    } catch (err) {
      console.warn('[VoiceService] Error cancelling provider on destroy:', err)
    }


    // 2. Unwire provider events (detaches closure references immediately)
    this._unwireProvider()

    // 3. Trigger provider destroy if available (releasing streams/sockets)
    if (typeof this._provider.destroy === 'function') {
      try {
        await this._provider.destroy()
      } catch (err) {
        console.warn('[VoiceService] Error destroying provider:', err)
      }
    }

    // 4. Clear client subscriber sets
    this._stateListeners.clear()
    this._partialListeners.clear()
    this._finalListeners.clear()
  }
}
