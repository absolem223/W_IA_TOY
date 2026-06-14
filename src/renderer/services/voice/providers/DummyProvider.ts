/**
 * providers/DummyProvider.ts — Argos Voice Service
 *
 * Simulates a complete dictation lifecycle without:
 *   - Accessing the microphone
 *   - Calling any external API
 *   - Requiring any network connectivity
 *
 * Purpose:
 *   - Validate that the VoiceService → ChatInput state pipeline works end to end.
 *   - Test animations, label transitions, and state-driven UI in isolation.
 *   - Serve as a reference implementation for real providers.
 *
 * Lifecycle emitted by start():
 *
 *   [0ms]    state → 'recording'
 *   [800ms]  state → 'transcribing'
 *            partial transcript emitted
 *   [1600ms] state → 'processing'
 *   [1900ms] state → 'generating'
 *            final transcript emitted  ← caller dispatches to LLM
 *   [2200ms] state → 'idle'            ← after generating, caller resets on chat done
 *
 * Note: The 'generating' → 'idle' transition is NOT emitted by this provider.
 * It is the caller's (ChatInput or VoiceService consumer) responsibility to
 * transition back to idle once the LLM response completes, matching the
 * existing pattern in ChatInput's useEffect.
 */

import { BaseVoiceProvider } from '../VoiceProvider'

const PARTIAL_TEXT = 'Probando Argos Voice'
const FINAL_TEXT   = 'Probando Argos Voice completo'

export class DummyProvider extends BaseVoiceProvider {
  readonly id = 'dummy'

  private _timer: ReturnType<typeof setTimeout> | null = null
  private _running = false

  async start(): Promise<void> {
    if (this._running) return
    this._running = true

    // ── Step 1: Recording ────────────────────────────────────────────────
    this._emitStateChange('recording')

    this._timer = setTimeout(() => {
      // ── Step 2: Transcribing + partial ──────────────────────────────────
      this._emitStateChange('transcribing')
      this._emitPartialTranscript(PARTIAL_TEXT)

      this._timer = setTimeout(() => {
        // ── Step 3: Processing ──────────────────────────────────────────
        this._emitStateChange('processing')

        this._timer = setTimeout(() => {
          // ── Step 4: Generating + final ────────────────────────────────
          this._emitStateChange('generating')
          this._emitFinalTranscript(FINAL_TEXT)

          // DummyProvider's job ends here.
          // 'idle' will be set by the consumer when the LLM response completes.
          this._running = false
          this._timer   = null
        }, 300)
      }, 800)
    }, 800)
  }

  async stop(): Promise<void> {
    // If called during recording phase, cancel and go idle
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
    if (this._running) {
      this._running = false
      this._emitStateChange('idle')
    }
  }

  async destroy(): Promise<void> {
    await this.stop()
    console.info('[DummyProvider] Cleaned up and destroyed')
  }
}

