/**
 * VoiceProvider.ts — Argos Voice Service: Abstract base class (optional)
 *
 * This file exports the VoiceProvider interface (re-exported from types)
 * and a BaseVoiceProvider abstract class that providers can optionally
 * extend to get callback management for free.
 *
 * Direct interface implementation is also valid if you prefer composition.
 */

import type { VoiceProvider, VoiceState, VoiceSubscription } from './types'

export type { VoiceProvider }

// ── BaseVoiceProvider ──────────────────────────────────────────────────────
// Optional base class. Handles callback storage and the emit helpers.
// Concrete providers should call:
//   this._emitStateChange('recording')
//   this._emitPartialTranscript('hello')
//   this._emitFinalTranscript('hello world')
export abstract class BaseVoiceProvider implements VoiceProvider {
  abstract readonly id: string

  private _onStateChangeCb:        ((state: VoiceState) => void) | null = null
  private _onPartialTranscriptCb:  ((text: string) => void) | null = null
  private _onFinalTranscriptCb:    ((text: string) => void) | null = null

  // ── VoiceProvider contract ────────────────────────────────────────────
  abstract start(): Promise<void>
  abstract stop(): Promise<void>

  onStateChange(callback: (state: VoiceState) => void): VoiceSubscription {
    this._onStateChangeCb = callback
    return {
      unsubscribe: () => {
        if (this._onStateChangeCb === callback) {
          this._onStateChangeCb = null
        }
      }
    }
  }

  onPartialTranscript(callback: (text: string) => void): VoiceSubscription {
    this._onPartialTranscriptCb = callback
    return {
      unsubscribe: () => {
        if (this._onPartialTranscriptCb === callback) {
          this._onPartialTranscriptCb = null
        }
      }
    }
  }

  onFinalTranscript(callback: (text: string) => void): VoiceSubscription {
    this._onFinalTranscriptCb = callback
    return {
      unsubscribe: () => {
        if (this._onFinalTranscriptCb === callback) {
          this._onFinalTranscriptCb = null
        }
      }
    }
  }


  // ── Protected emit helpers ────────────────────────────────────────────
  // Called by concrete providers to push events to VoiceService.
  protected _emitStateChange(state: VoiceState): void {
    this._onStateChangeCb?.(state)
  }

  protected _emitPartialTranscript(text: string): void {
    this._onPartialTranscriptCb?.(text)
  }

  protected _emitFinalTranscript(text: string): void {
    this._onFinalTranscriptCb?.(text)
  }
}
