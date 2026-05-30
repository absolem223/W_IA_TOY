// ── Voice Manager ────────────────────────────────────────────
// State machine, provider orchestration, IPC, telemetry.
// Owns all voice logic in the main process.
//
// Architecture notes:
// - VoiceSettings (persistent): providerId, voiceId, speed, pitch, volume, enabled, muted
// - VoiceRuntimeState (ephemeral): state, requestId, queue, isAudioPlaying
// - Providers (pluggable): WebSpeech (local), OpenAI (cloud)
// - IPC: audio-buffer uses Uint8Array (AudioBufferPayload), web-speech uses PlayTextCommand

import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import type { Logger } from '../logger'
import type {
  VoiceState,
  VoiceProvider,
  VoiceSettings,
  VoiceStatus,
  VoiceTelemetry,
  StateTransitionReason,
  PlayTextCommand,
  AudioBufferPayload,
  StateChangedEvent,
} from './types'
import { DEFAULT_VOICE_SETTINGS, VOICE_LIMITS } from './types'
import { WebSpeechProvider } from './providers/webSpeech'
import { sanitizeForSpeech } from './speechPreprocessor'
// NOTE: Cloud providers (OpenAI, Gemini, ElevenLabs, Piper, etc.) are
// registered externally from main/index.ts based on environment.
// VoiceManager is provider-agnostic — it only depends on VoiceProvider interface.

// ── Valid transitions ──
const VALID_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  idle:        ['generating', 'error'],
  generating:  ['speaking', 'idle', 'interrupted', 'error'],
  speaking:    ['idle', 'generating', 'interrupted', 'error'],
  interrupted: ['idle', 'generating', 'error'],
  error:       ['idle'],
}

export class VoiceManager {
  // ── Persistent settings (written to disk) ──
  private settings: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS }
  private settingsPath: string

  // ── Runtime state (ephemeral) ──
  // Track the most recent chunk text to handle cancellation properly
  private currentText: string | null = null

  // Cache for TTS results (up to 20 entries) to support instant Replay
  private ttsCache: Map<string, any> = new Map()
  private state: VoiceState = 'idle'
  private currentRequestId = ''
  private requestCounter = 0
  private synthesisTimeout: ReturnType<typeof setTimeout> | null = null
  private playbackTimeout:  ReturnType<typeof setTimeout> | null = null
  private initialized = false
  private ipcCleanup: (() => void) | null = null

  // Playback Queue
  private chunkQueue: Array<{ text: string; originChatRequestId?: number }> = []
  private isProcessingQueue = false
  private isAudioPlaying = false

  private logger: Logger
  private providers = new Map<string, VoiceProvider>()

  // ── Telemetry ──
  private telemetry: VoiceTelemetry = {
    totalSpeakRequests:     0,
    totalCancellations:     0,
    totalReplacements:      0,
    totalTimeouts:          0,
    totalErrors:            0,
    totalCharsSpoken:       0,
    totalPlaybackMs:        0,
    lastPlaybackDurationMs: 0,
    totalAudioSizeBytes:    0,
    lastGenerationLatencyMs: 0,
    lastAudioSizeBytes:     0,
    lastError:              '',
    lastRequestId:          '',
    providerUsage:          {},
  }

  constructor(userDataPath: string, logger: Logger) {
    this.settingsPath = join(userDataPath, 'voice-config.json')
    this.logger = logger
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('[VOICE] Initializing voice system...')

      // Load persisted settings
      await this.loadSettings()

      // Register built-in providers (local only — no cloud deps)
      this.registerProvider(new WebSpeechProvider())
      // Cloud providers are registered externally by main/index.ts
      // after checking env vars (OPENAI_API_KEY, GEMINI_API_KEY, etc.)

      // Register IPC handlers
      this.registerIpcHandlers()

      this.initialized = true
      this.logger.info(`[VOICE] Initialized. Provider: ${this.settings.providerId}, Enabled: ${this.settings.enabled}, Muted: ${this.settings.muted}`)
    } catch (err) {
      this.logger.error('[VOICE] Initialization failed:', err)
      this.initialized = false
    }
  }

  // ── State Machine ──

  private transition(to: VoiceState, reason: StateTransitionReason): boolean {
    const from = this.state
    const valid = VALID_TRANSITIONS[from]

    if (!valid.includes(to)) {
      this.logger.warn(`[VOICE_STATE] INVALID: ${from} → ${to} (${reason}), ignoring`)
      return false
    }

    this.state = to
    this.logger.info(`[VOICE_STATE] ${this.currentRequestId}: ${from} → ${to} (${reason})`)

    // Notify renderer
    this.sendToRenderer('voice:state-changed', {
      state: to,
      previousState: from,
      reason,
      requestId: this.currentRequestId,
    } satisfies StateChangedEvent)

    return true
  }

  private generateRequestId(): string {
    return `voice-${++this.requestCounter}-${Date.now()}`
  }

  // ── Core API ──

  async speak(text: string, overrideRequestId?: string, originChatRequestId?: number): Promise<{ success: boolean; error?: string }> {
    if (!this.initialized) {
      this.logger.warn(`[VOICE_PLAYBACK_BLOCKED] System not initialized`)
      return { success: false, error: 'Voice system not initialized' }
    }
    if (!this.settings.enabled) {
      this.logger.warn(`[VOICE_PLAYBACK_BLOCKED] Voice is disabled globally`)
      return { success: false, error: 'Voice disabled. Use /voice on' }
    }
    if (this.settings.muted) {
      this.logger.warn(`[VOICE_PLAYBACK_BLOCKED] Voice is muted`)
      return { success: false, error: 'Voice muted' }
    }
    if (!text || text.trim().length === 0) {
      this.logger.warn(`[VOICE_PLAYBACK_BLOCKED] Empty text`)
      return { success: false, error: 'Empty text' }
    }

    const requestId = overrideRequestId || this.generateRequestId()
    this.logger.info(`[VOICE_PLAYBACK_REQUEST] ID: ${requestId} | Text: "${text.substring(0, 30)}..."`)
    this.telemetry.totalSpeakRequests++

    // Replace mode: if NEW request, cancel current queue
    if (this.state !== 'idle' && this.currentRequestId !== requestId) {
      this.logger.info(`[VOICE] ${requestId}: Replacing current speech (was ${this.state})`)
      this.telemetry.totalReplacements++
      this.cancelInternal('replace')
    }

    this.currentRequestId = requestId
    const cleanText = sanitizeForSpeech(text)

    if (cleanText) {
      this.logger.info(`[VOICE_QUEUE] Enqueueing chunk (${cleanText.length} chars). Queue size: ${this.chunkQueue.length + 1}`)
      this.chunkQueue.push({ text: cleanText, originChatRequestId })
      this.processQueue()
    } else {
      this.logger.warn(`[VOICE_QUEUE] Text empty after sanitization, ignoring chunk.`)
    }

    return { success: true }
  }

  private async processQueue(): Promise<void> {
    this.logger.info(`[VOICE_QUEUE] processQueue. isProcessing=${this.isProcessingQueue}, isAudioPlaying=${this.isAudioPlaying}, queueLen=${this.chunkQueue.length}`)

    if (this.isProcessingQueue || this.isAudioPlaying) {
      this.logger.info(`[VOICE_QUEUE] Blocked: waiting for current chunk to finish`)
      return
    }

    if (this.chunkQueue.length === 0) {
      this.logger.info(`[VOICE_QUEUE] Queue empty, transitioning to idle`)
      if (this.state === 'speaking' || this.state === 'generating') {
        this.transition('idle', 'playback_done')
      }
      return
    }

    this.isProcessingQueue = true
    const chunk = this.chunkQueue.shift()!
    const text = chunk.text
    const originChatRequestId = chunk.originChatRequestId
    this.currentText = text

    this.logger.info(`[VOICE_QUEUE] Dequeued chunk (${text.length} chars). Remaining: ${this.chunkQueue.length}`)

    if (this.state === 'idle' || this.state === 'interrupted') {
      if (!this.transition('generating', 'speak')) {
        this.isProcessingQueue = false
        return
      }
    }

    const provider = this.getActiveProvider()
    const requestId = this.currentRequestId
    const generationStart = Date.now()

    if (!provider) {
      this.logger.error('[VOICE_QUEUE] No active provider found')
      this.transition('error', 'error')
      setTimeout(() => this.state === 'error' && this.transition('idle', 'error'), 3000)
      this.telemetry.totalErrors++
      this.isProcessingQueue = false
      return
    }

    this.telemetry.providerUsage[provider.id] = (this.telemetry.providerUsage[provider.id] || 0) + 1

    // Synthesis timeout watchdog
    this.synthesisTimeout = setTimeout(() => {
      if (this.state === 'generating' && this.currentRequestId === requestId) {
        this.logger.warn(`[VOICE_PROVIDER] ${requestId}: Synthesis timeout (${VOICE_LIMITS.SYNTHESIS_TIMEOUT_MS}ms)`)
        this.telemetry.totalTimeouts++
        this.telemetry.lastError = `Synthesis timeout (${VOICE_LIMITS.SYNTHESIS_TIMEOUT_MS}ms)`
        this.cancelInternal('timeout')
        this.telemetry.totalErrors++
      }
    }, VOICE_LIMITS.SYNTHESIS_TIMEOUT_MS)

    try {
      let result = this.ttsCache.get(this.currentText)
      let generationLatencyMs = 0

      if (result) {
        this.logger.info(`[VOICE_PROVIDER] ${requestId}: Cache hit for TTS (${text.length} chars)`)
        this.clearSynthesisTimeout()
      } else {
        this.logger.info(`[VOICE_PROVIDER] ${requestId}: ${provider.id}.synthesize() started (${text.length} chars)`)
        
        result = await provider.synthesize(this.currentText, {
          voiceId: this.settings.voiceId || undefined,
          speed:   this.settings.speed,
        })
        
        this.clearSynthesisTimeout()
        
        // Save to cache (limit size to 20)
        if (this.ttsCache.size >= 20) {
          const firstKey = this.ttsCache.keys().next().value
          if (firstKey) this.ttsCache.delete(firstKey)
        }
        this.ttsCache.set(this.currentText, result)
      }

      generationLatencyMs = Date.now() - generationStart
      this.telemetry.lastGenerationLatencyMs = generationLatencyMs
      this.logger.info(`[VOICE_PROVIDER] ${requestId}: synthesize() complete in ${generationLatencyMs}ms via '${result.method}'`)

      // Guard: check if still valid after async synthesis
      if (this.currentRequestId !== requestId || (this.state !== 'generating' && this.state !== 'speaking')) {
        this.logger.info(`[VOICE_PROVIDER] ${requestId}: Stale result (current: ${this.currentRequestId}), discarding`)
        this.isProcessingQueue = false
        this.processQueue()
        return
      }

      // ── web-speech branch ──
      if (result.method === 'web-speech' && result.text) {
        if (this.state !== 'speaking') {
          if (!this.transition('speaking', 'synthesis_complete')) {
            this.isProcessingQueue = false
            return
          }
        }

        this.isAudioPlaying = true

        this.playbackTimeout = setTimeout(() => {
          if (this.state === 'speaking' && this.currentRequestId === requestId) {
            this.logger.warn(`[VOICE_PLAYBACK] ${requestId}: Playback timeout`)
            this.telemetry.totalTimeouts++
            this.cancelInternal('timeout')
          }
        }, VOICE_LIMITS.PLAYBACK_TIMEOUT_MS)

        const cmd: PlayTextCommand = {
          requestId,
          text:    result.text,
          voiceId: this.settings.voiceId || undefined,
          speed:   this.settings.speed,
          pitch:   this.settings.pitch,
          volume:  this.settings.volume,
          originChatRequestId: originChatRequestId
        }

        this.logger.info(`[VOICE_QUEUE] ${requestId}: Sending 'voice:play-text' to renderer. Awaiting ACK...`)
        this.sendToRenderer('voice:play-text', cmd)
        this.telemetry.totalCharsSpoken += result.text.length
        this.telemetry.lastRequestId = requestId

        this.isProcessingQueue = false
        return
      }

      // ── audio-buffer branch (OpenAI, ElevenLabs, etc.) ──
      if (result.method === 'audio-buffer' && result.audioBytes) {
        if (this.state !== 'speaking') {
          if (!this.transition('speaking', 'synthesis_complete')) {
            this.isProcessingQueue = false
            return
          }
        }

        const audioSizeBytes = result.audioBytes.byteLength
        this.telemetry.totalAudioSizeBytes += audioSizeBytes
        this.telemetry.lastAudioSizeBytes = audioSizeBytes

        this.logger.info(`[VOICE_QUEUE] ${requestId}: Sending 'voice:play-audio' (${audioSizeBytes} bytes, ${result.mimeType}). Awaiting ACK...`)

        this.isAudioPlaying = true

        this.playbackTimeout = setTimeout(() => {
          if (this.state === 'speaking' && this.currentRequestId === requestId) {
            this.logger.warn(`[VOICE_PLAYBACK] ${requestId}: Playback timeout`)
            this.telemetry.totalTimeouts++
            this.cancelInternal('timeout')
          }
        }, VOICE_LIMITS.PLAYBACK_TIMEOUT_MS)

        const payload: AudioBufferPayload = {
          requestId,
          mimeType:   result.mimeType ?? 'audio/wav',
          audioBytes: result.audioBytes,
          durationMs: result.durationEstimateMs,
        }

        this.sendToRenderer('voice:play-audio', payload)
        this.telemetry.lastRequestId = requestId

        this.isProcessingQueue = false
        return
      }

      // Unknown method
      this.logger.error(`[VOICE_PROVIDER] ${requestId}: Unknown synthesis method: ${result.method}`)
      this.transition('error', 'error')
      setTimeout(() => this.state === 'error' && this.transition('idle', 'error'), 3000)
      this.isProcessingQueue = false

    } catch (err) {
      this.clearSynthesisTimeout()

      if (this.currentRequestId !== requestId) {
        this.logger.info(`[VOICE_PROVIDER] ${requestId}: Stale error/abort (current: ${this.currentRequestId}), discarding`)
        this.isProcessingQueue = false
        this.processQueue()
        return
      }

      this.isAudioPlaying = false
      this.chunkQueue = []

      if (this.currentRequestId === requestId && (this.state === 'generating' || this.state === 'speaking')) {
        this.transition('error', 'error')
        setTimeout(() => this.state === 'error' && this.transition('idle', 'error'), 3000)
      }
      this.telemetry.totalErrors++
      this.telemetry.lastError = (err as Error)?.message ?? String(err)
      this.logger.error(`[VOICE_PROVIDER] ${requestId}: Synthesis failed:`, err)
      this.isProcessingQueue = false
    }
  }

  stop(): void {
    if (this.state === 'idle') {
      this.logger.info(`[VOICE] stop() called but already idle`)
      return
    }
    this.cancelInternal('cancel')
  }

  private cancelInternal(reason: StateTransitionReason): void {
    this.logger.info(`[VOICE_QUEUE] Cancelling active queue. Reason: ${reason}`)

    // Purge queue immediately
    this.chunkQueue = []
    this.isAudioPlaying = false

    const provider = this.getActiveProvider()
    provider?.stop()

    this.clearSynthesisTimeout()
    this.clearPlaybackTimeout()

    // Tell renderer to stop all playback (web-speech AND audio-buffer)
    this.sendToRenderer('voice:stop-playback', undefined)

    if (this.state !== 'idle' && this.state !== 'interrupted') {
      this.transition(reason === 'cancel' || reason === 'replace' ? 'interrupted' : 'idle', reason)

      // Auto-recover to idle after interruption
      if (reason === 'cancel' || reason === 'replace') {
        setTimeout(() => {
          if (this.state === 'interrupted') {
            this.transition('idle', 'cancel')
          }
        }, 1000)
      }
    }

    if (reason === 'cancel') {
      this.telemetry.totalCancellations++
    }
  }

  // ── Playback callbacks (from renderer) ──

  handlePlaybackStarted(requestId: string): void {
    // Guard: ignore stale ACKs
    if (requestId !== this.currentRequestId) {
      this.logger.warn(`[VOICE_QUEUE] handlePlaybackStarted ignored: got ${requestId}, expected ${this.currentRequestId}`)
      return
    }
    this.logger.info(`[VOICE_PLAYBACK] ${requestId}: started`)
  }

  handlePlaybackEnded(requestId: string, durationMs: number): void {
    // Guard: ignore stale ACKs
    if (requestId !== this.currentRequestId) {
      this.logger.warn(`[VOICE_QUEUE] handlePlaybackEnded ignored: got ${requestId}, expected ${this.currentRequestId}`)
      return
    }

    this.clearPlaybackTimeout()
    this.telemetry.totalPlaybackMs += durationMs
    this.telemetry.lastPlaybackDurationMs = durationMs
    this.logger.info(`[VOICE_PLAYBACK_ACK] ${requestId}: ended (${durationMs}ms). Unblocking queue...`)

    // Release audio lock and process next chunk
    this.isAudioPlaying = false
    this.processQueue()
  }

  handlePlaybackError(requestId: string, error: string): void {
    // Guard: ignore stale ACKs
    if (requestId !== this.currentRequestId) {
      this.logger.warn(`[VOICE_QUEUE] handlePlaybackError ignored: got ${requestId}, expected ${this.currentRequestId}`)
      return
    }

    this.clearPlaybackTimeout()
    this.isAudioPlaying = false
    this.chunkQueue = []

    this.telemetry.totalErrors++
    this.telemetry.lastError = error
    this.logger.error(`[VOICE_PLAYBACK] ${requestId}: error -> ${error}`)

    if (this.state === 'speaking' || this.state === 'generating') {
      this.transition('error', 'error')
      setTimeout(() => this.state === 'error' && this.transition('idle', 'error'), 3000)
    }
  }

  // ── Settings (persistent) ──

  updateConfig(partial: Partial<VoiceSettings>): VoiceSettings {
    const prevProvider = this.getActiveProvider()

    // If muting while speaking, stop immediately
    if (partial.muted === true && this.state !== 'idle') {
      prevProvider?.stop()
      this.cancelInternal('muted')
    }

    // If disabling while active, stop
    if (partial.enabled === false && this.state !== 'idle') {
      prevProvider?.stop()
      this.cancelInternal('cancel')
    }

    // If changing provider while active, stop old provider and cancel/replace queue
    if (partial.providerId && partial.providerId !== this.settings.providerId && this.state !== 'idle') {
      prevProvider?.stop()
      this.cancelInternal('replace')
    }

    Object.assign(this.settings, partial)
    this.saveSettings().catch(err => this.logger.error('[VOICE] Settings save failed:', err))
    this.logger.info(`[VOICE] Settings updated:`, JSON.stringify(this.settings))

    // Notify renderer of config change
    this.sendToRenderer('voice:config-changed', {
      enabled:    this.settings.enabled,
      muted:      this.settings.muted,
      providerId: this.settings.providerId,
      voiceId:    this.settings.voiceId,
      speed:      this.settings.speed,
      pitch:      this.settings.pitch,
      volume:     this.settings.volume,
    })

    return { ...this.settings }
  }

  isEnabled(): boolean { return this.settings.enabled }
  isMuted(): boolean   { return this.settings.muted }
  getState(): VoiceState { return this.state }

  getStatus(): VoiceStatus {
    return {
      state:           this.state,
      enabled:         this.settings.enabled,
      muted:           this.settings.muted,
      currentProvider: this.settings.providerId,
      currentVoiceId:  this.settings.voiceId,
      currentText:     this.state !== 'idle' ? (this.currentText ?? undefined) : undefined,
      currentRequestId: this.state !== 'idle' ? this.currentRequestId : undefined,
    }
  }

  getTelemetry(): VoiceTelemetry {
    return { ...this.telemetry }
  }

  // ── Provider Management ──

  /**
   * Register a voice provider. Call this from main/index.ts after checking
   * env availability. Providers registered this way appear in /voice provider list.
   */
  registerProvider(provider: VoiceProvider): void {
    this.providers.set(provider.id, provider)
    this.logger.info(`[VOICE] Provider registered: ${provider.id} (${provider.name})`)
  }

  /**
   * Returns a copy of all registered provider IDs and names.
   * Used by /voice provider list command.
   */
  getRegisteredProviders(): Array<{ id: string; name: string; type: string }> {
    return Array.from(this.providers.values()).map(p => ({ id: p.id, name: p.name, type: p.type }))
  }

  private getActiveProvider(): VoiceProvider | undefined {
    return this.providers.get(this.settings.providerId)
  }

  // ── Lifecycle ──

  handleRendererReady(): void {
    this.logger.info('[VOICE] Renderer ready received, resetting runtime state and syncing.')
    this.clearSynthesisTimeout()
    this.clearPlaybackTimeout()
    this.isAudioPlaying = false
    this.isProcessingQueue = false
    this.chunkQueue = []
    
    // Stop active provider if any
    this.getActiveProvider()?.stop()
    this.state = 'idle'
    
    // Re-send current config state snapshot to renderer
    this.sendToRenderer('voice:config-changed', {
      enabled:    this.settings.enabled,
      muted:      this.settings.muted,
      providerId: this.settings.providerId,
      voiceId:    this.settings.voiceId,
      speed:      this.settings.speed,
      pitch:      this.settings.pitch,
      volume:     this.settings.volume,
    })
  }

  handleRendererCrash(): void {
    this.logger.warn('[VOICE_STATE] Renderer crashed, forcing idle')
    this.clearSynthesisTimeout()
    this.clearPlaybackTimeout()
    this.getActiveProvider()?.stop()
    this.state = 'idle' // Direct assignment — no transition event (renderer is dead)
    this.isAudioPlaying = false
    this.isProcessingQueue = false
    this.chunkQueue = []
  }

  async shutdown(): Promise<void> {
    this.logger.info('[VOICE] Shutting down...')
    if (this.state !== 'idle') {
      this.cancelInternal('shutdown')
    }
    this.logger.info(`[VOICE] Final telemetry: ${JSON.stringify(this.telemetry)}`)
    if (this.ipcCleanup) {
      this.ipcCleanup()
      this.ipcCleanup = null
    }
    // Dispose all providers
    for (const provider of this.providers.values()) {
      await provider.dispose?.()
    }
    await this.saveSettings()
    this.initialized = false
    this.logger.info('[VOICE] Shutdown complete')
  }

  // ── IPC ──

  private registerIpcHandlers(): void {
    const handleSpeak = async (_event: Electron.IpcMainInvokeEvent, payload: { text: string }) => {
      return this.speak(payload.text)
    }
    const handleStop       = async () => { this.stop() }
    const handleGetStatus  = async () => this.getStatus()
    const handleGetVoices  = async () => {
      const provider = this.getActiveProvider()
      if (!provider) return []
      return provider.getVoices()
    }
    const handleSetConfig  = async (_event: Electron.IpcMainInvokeEvent, partial: Partial<VoiceSettings>) => {
      return this.updateConfig(partial)
    }
    const handleHealthCheck = async () => {
      const provider = this.getActiveProvider()
      if (!provider) return { available: false, error: 'No provider' }
      return provider.healthCheck()
    }
    const handlePlaybackStarted = (_event: Electron.IpcMainEvent, requestId: string) => {
      this.handlePlaybackStarted(requestId)
    }
    const handlePlaybackEnded = (_event: Electron.IpcMainEvent, requestId: string, durationMs: number) => {
      this.handlePlaybackEnded(requestId, durationMs)
    }
    const handlePlaybackError = (_event: Electron.IpcMainEvent, requestId: string, error: string) => {
      this.handlePlaybackError(requestId, error)
    }
    const handleRendererReady = () => {
      this.handleRendererReady()
    }

    ipcMain.handle('voice:speak',        handleSpeak)
    ipcMain.handle('voice:stop',         handleStop)
    ipcMain.handle('voice:get-status',   handleGetStatus)
    ipcMain.handle('voice:get-voices',   handleGetVoices)
    ipcMain.handle('voice:set-config',   handleSetConfig)
    ipcMain.handle('voice:health-check', handleHealthCheck)
    ipcMain.on('voice:playback-started', handlePlaybackStarted)
    ipcMain.on('voice:playback-ended',   handlePlaybackEnded)
    ipcMain.on('voice:playback-error',   handlePlaybackError)
    ipcMain.on('voice:renderer-ready',   handleRendererReady)

    this.ipcCleanup = () => {
      ipcMain.removeHandler('voice:speak')
      ipcMain.removeHandler('voice:stop')
      ipcMain.removeHandler('voice:get-status')
      ipcMain.removeHandler('voice:get-voices')
      ipcMain.removeHandler('voice:set-config')
      ipcMain.removeHandler('voice:health-check')
      ipcMain.removeListener('voice:playback-started', handlePlaybackStarted)
      ipcMain.removeListener('voice:playback-ended',   handlePlaybackEnded)
      ipcMain.removeListener('voice:playback-error',   handlePlaybackError)
      ipcMain.removeListener('voice:renderer-ready',   handleRendererReady)
      this.logger.info('[VOICE] IPC handlers removed')
    }

    this.logger.info('[VOICE] IPC handlers registered')
  }

  private sendToRenderer(channel: string, payload: unknown): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.send(channel, payload)
      }
    }
  }

  // ── Persistence ──

  private async loadSettings(): Promise<void> {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf-8')
      const loaded = JSON.parse(raw) as Partial<VoiceSettings>
      this.settings = { ...DEFAULT_VOICE_SETTINGS, ...loaded }
    } catch {
      this.settings = { ...DEFAULT_VOICE_SETTINGS }
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2))
    } catch (err) {
      this.logger.error('[VOICE] Failed to save settings:', err)
    }
  }

  // ── Timeout Helpers ──

  private clearSynthesisTimeout(): void {
    if (this.synthesisTimeout) {
      clearTimeout(this.synthesisTimeout)
      this.synthesisTimeout = null
    }
  }

  private clearPlaybackTimeout(): void {
    if (this.playbackTimeout) {
      clearTimeout(this.playbackTimeout)
      this.playbackTimeout = null
    }
  }
}
