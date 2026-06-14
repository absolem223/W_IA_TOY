/**
 * types.ts — Argos Voice Service: Core types
 *
 * These types are intentionally decoupled from the existing useVoice hook
 * (which manages TTS/playback). This module is focused on STT (dictation):
 * microphone capture → transcription → text delivery to the chat pipeline.
 *
 * Future: These types may be unified once the full voice pipeline matures.
 */

// ── VoiceState ─────────────────────────────────────────────────────────────
// Represents every possible state in the dictation lifecycle.
// Each state is mutually exclusive; transitions are managed by VoiceService.
export type VoiceState =
  | 'idle'          // No active voice session. Default state.
  | 'recording'     // Microphone is open and capturing audio.
  | 'transcribing'  // Audio captured; sending to STT engine.
  | 'processing'    // Transcript received; preparing to dispatch.
  | 'generating'    // Text dispatched to LLM; awaiting response.
  | 'error'         // Unrecoverable error occurred; see onError callback.

// ── VoiceProvider ──────────────────────────────────────────────────────────
// The minimal contract every STT provider must satisfy.
// VoiceService holds exactly one VoiceProvider at a time and delegates
// all capture/transcription work to it.
//
// Providers implemented or planned:
//   - DummyProvider       → testing / CI (no microphone, no network)
//   - MediaRecorderProvider → native MediaRecorder + existing electronAPI STT
//   - WhisperCppProvider  → local Whisper.cpp over IPC or HTTP
//   - FasterWhisperProvider → Python Faster Whisper subprocess
//   - WebSpeechProvider   → browser Web Speech API (online)
//   - OllamaVoiceProvider → Ollama speech model (future)
export interface VoiceProvider {
  /** Human-readable identifier, e.g. "dummy", "whisper-cpp", "web-speech". */
  readonly id: string

  /** Start audio capture and begin the transcription lifecycle. */
  start(): Promise<void>

  /** Stop audio capture (triggers onstop → transcription → callbacks). */
  stop(): Promise<void>

  /**
   * Register a callback that fires whenever a partial transcript is available.
   * Returns a VoiceSubscription to cleanly unsubscribe.
   */
  onPartialTranscript(callback: (text: string) => void): VoiceSubscription

  /**
   * Register a callback that fires exactly once per recording session
   * when the final transcript is ready.
   * Returns a VoiceSubscription to cleanly unsubscribe.
   */
  onFinalTranscript(callback: (text: string) => void): VoiceSubscription

  /**
   * Register a callback that fires on every state transition.
   * Returns a VoiceSubscription to cleanly unsubscribe.
   */
  onStateChange(callback: (state: VoiceState) => void): VoiceSubscription

  /** Optional cleanup method to release underlying resources, active timers, or streams. */
  destroy?(): Promise<void>

  /** Optional cancellation method to stop recording and discard captured audio. */
  cancel?(): Promise<void>
}


// ── VoiceServiceConfig ─────────────────────────────────────────────────────
// Configuration object passed to VoiceService on creation.
export interface VoiceServiceConfig {
  /** The provider to use. Can be swapped at runtime via VoiceService.setProvider(). */
  provider: VoiceProvider
}

// ── VoiceSubscription ─────────────────────────────────────────────────────
// Return type for subscribe methods. Calling unsubscribe() removes the listener.
export interface VoiceSubscription {
  unsubscribe(): void
}
