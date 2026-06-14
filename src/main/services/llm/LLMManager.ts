import { join } from 'path'
import { promises as fs } from 'fs'
import { exec } from 'child_process'
import type { ChatMessage } from '../../../shared/types'
import type { InferenceProvider, LLMSettings, LLMStatus, ProviderCapabilities, ChatCompletionChunk } from './types'
import { DEFAULT_LLM_SETTINGS } from './types'
import { BrowserWindow } from 'electron'

export class LLMManager {
  private settings: LLMSettings = { ...DEFAULT_LLM_SETTINGS }
  private settingsPath: string
  private providers = new Map<string, InferenceProvider>()
  private initialized = false
  private log: (msg: string, ...args: any[]) => void
  private logError: (msg: string, ...args: any[]) => void
  private onSyncCallback?: () => void
  // Reconnector state
  private reconnectorTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private reconnectBaseMs = Number(process.env.LLM_RECONNECT_INTERVAL_MS || 30000)
  private reconnectMaxAttempts = Number(process.env.LLM_RECONNECT_MAX_ATTEMPTS || 10)
  private fallbackPolicy: string = (process.env.LLM_FALLBACK_POLICY || 'cascade')
  // Pre-fallback settings tracking
  private preFallbackSettings: { providerId: string; modelId: string } | null = null

  private notifyUser(message: string): void {
    this.broadcastStatusChangeAlert(message)
    try {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('chat:system-message', message)
      })
    } catch {}
  }

  constructor(userDataPath: string, log: (msg: string, ...args: any[]) => void, logError: (msg: string, ...args: any[]) => void) {
    this.settingsPath = join(userDataPath, 'llm-config.json')
    this.log = log
    this.logError = logError
  }

  setOnSync(callback: () => void) {
    this.onSyncCallback = callback
  }

  async initialize(): Promise<void> {
    try {
      this.log('[LLM] Initializing LLM manager...')
      await this.loadSettings()
      // Load runtime policy overrides from env (env takes precedence over file)
      this.fallbackPolicy = process.env.LLM_FALLBACK_POLICY || this.fallbackPolicy
      this.reconnectBaseMs = Number(process.env.LLM_RECONNECT_INTERVAL_MS || this.reconnectBaseMs)
      this.reconnectMaxAttempts = Number(process.env.LLM_RECONNECT_MAX_ATTEMPTS || this.reconnectMaxAttempts)
      this.log(`[LLM] Fallback policy=${this.fallbackPolicy} reconnectBaseMs=${this.reconnectBaseMs} maxAttempts=${this.reconnectMaxAttempts}`)
      // If no model configured, request BIOS modal in renderer and wait for selection
      if (!this.settings.modelId) {
        this.log('[LLM] No model configured in llm-config.json — requesting BIOS')
        try { BrowserWindow.getAllWindows().forEach(w => { if (!w.isDestroyed()) w.webContents.send('llm:show-bios') }) } catch {}
        // wait until modelId is set (by ipc llm:bios-selected handler) or timeout (5 minutes)
        const start = Date.now()
        while (!this.settings.modelId && Date.now() - start < 5 * 60 * 1000) {
          await new Promise(r => setTimeout(r, 500))
          // reload settings from disk in case external handler updated file
          await this.loadSettings()
        }
      }

      // If model configured, proceed to try to ensure LMStudio is running and model loaded
      if (this.settings.modelId) {
        const lm = this.providers.get('lmstudio')
        if (lm) {
          const health = await lm.healthCheck().catch(() => ({ available: false }))
          if (!(health as any).available) {
            this.log('[LLM] LMStudio not responding — attempting to start local LMStudio')
            const exe = process.env.LMSTUDIO_EXE_PATH
            if (exe) {
              try {
                exec(`"${exe}"`, { windowsHide: true }, (err) => {
                  if (err) this.logError('[LLM] Failed to start LMStudio:', err)
                })
              } catch (e: any) {
                this.logError('[LLM] Exception launching LMStudio:', e?.message || e)
              }
              // Poll every 2s up to 30s
              const pollStart = Date.now()
              let available = false
              while (Date.now() - pollStart < 30_000) {
                const h = await lm.healthCheck().catch(() => ({ available: false }))
                if ((h as any).available) { available = true; break }
                await new Promise(r => setTimeout(r, 2000))
              }
              if (!available) {
                const msg = 'Estoy ajustando la forma en la que proceso la informacion para mantenerme agil.'
                this.log('[LLM] ' + msg)
                this.notifyUser(msg)
                // Start reconnector
                this.startReconnector()
                await this.selectInitialProvider()
              }
            } else {
              this.log('[LLM] LMSTUDIO_EXE_PATH not configured — cannot auto-start LMStudio')
              await this.selectInitialProvider()
            }
          } else {
            // LMStudio running — verify model availability
            try {
              const resp = await fetch((lm as any).baseUrl + '/models', { method: 'GET' })
              if (resp.ok) {
                const data = await resp.json()
                const available = (data.data ?? []).map((m: any) => m.id)

                if (available.length === 0) {
                  const notify = 'Necesito una herramienta cognitiva disponible para pensar con fluidez. Puedo seguir en modo reducido mientras se prepara una.'
                  this.log('[LLM] ' + notify)
                  this.notifyUser(notify)
                  await this.selectInitialProvider()
                } else {
                  // If configured modelId exists and is present, keep it. Otherwise notify.
                  // Do not overwrite llm-config.json here: the configured model is the user's
                  // preference, and LMStudioProvider.resolveModel() can use a loaded model
                  // temporarily at inference time until the preferred one is loaded.
                  if (this.settings.modelId && !available.includes(this.settings.modelId)) {
                    const notify = 'Voy a utilizar un enfoque disponible temporalmente para responderte con mayor rapidez.'
                    this.log('[LLM] ' + notify)
                    this.notifyUser(notify)
                  }
                  // otherwise configured model is present — nothing to do
                }
              }
            } catch (e) {
              // ignore — selection logic will handle fallbacks
            }
          }
        }
      }
      this.initialized = true
      this.log(`[LLM] Initialized. Provider: ${this.settings.providerId}, Model: ${this.settings.modelId}`)
      this.broadcastStatus()
    } catch (err: any) {
      this.logError('[LLM] Initialization failed:', err)
      this.initialized = false
    }
  }

  /** Decide initial provider on startup honoring fallback policy */
  private async selectInitialProvider(): Promise<void> {
    // If policy is strict, do not attempt automatic fallbacks
    const desired = this.settings.providerId
    const provider = this.providers.get(desired)
    if (!provider) return

    if (desired === 'lmstudio' && this.fallbackPolicy === 'cascade') {
      try {
        const lm = this.providers.get('lmstudio')
        if (lm) {
          const health = await lm.healthCheck().catch(() => ({ available: false }))
          if (health && (health as any).available) {
            // LMStudio available — keep as is
            return
          }
        }
      } catch {}

      // LMStudio not available — attempt OpenRouter if policy=cascade
      const open = this.providers.get('openrouter')
      if (open) {
        const openHealth = await open.healthCheck().catch(() => ({ available: false }))
        if ((openHealth as any).available) {
          // notify user and switch to OpenRouter
          const msg = 'Estoy ajustando la forma en la que proceso la informacion para mantenerme agil.'
          this.log(`[LLM] ${msg}`)
          this.notifyUser(msg)
          this.savePreFallbackSettings()
          await this.updateConfig({ providerId: 'openrouter' }, true)
          // Start reconnector to monitor LMStudio
          this.startReconnector()
          return
        }
      }

      // OpenRouter not available — fall back to local offline provider
      const fallback = this.providers.get('fallback')
      const errMsg = 'Estoy en modo reducido: no tengo una herramienta cognitiva completa disponible ahora mismo.'
      this.log(`[LLM] ${errMsg}`)
      this.notifyUser(errMsg)
      this.savePreFallbackSettings()
      if (fallback) await this.updateConfig({ providerId: 'fallback' }, true)
    }
  }

  /** Start a reconnect loop with exponential backoff to re-check LMStudio */
  private startReconnector(): void {
    // Avoid double-start
    if (this.reconnectorTimer) return
    this.reconnectAttempts = 0
    const attempt = async () => {
      this.reconnectAttempts++
      const backoffSeq = [this.reconnectBaseMs, this.reconnectBaseMs * 2, this.reconnectBaseMs * 4, 300000]
      const idx = Math.min(this.reconnectAttempts - 1, backoffSeq.length - 1)
      const waitMs = backoffSeq[idx]
      this.log(`[LLM] Reconnector attempt #${this.reconnectAttempts} — next check in ${Math.round(waitMs/1000)}s`)

      try {
        const lm = this.providers.get('lmstudio')
        if (lm) {
          const health = await lm.healthCheck().catch(() => ({ available: false }))
          if ((health as any).available) {
            // LMStudio returned — switch back
            const successMsg = 'Ya puedo volver a una forma de procesamiento mas completa.'
            this.log('[LLM] ' + successMsg)
            this.notifyUser(successMsg)
            
            const restoreSettings: Partial<LLMSettings> = { providerId: 'lmstudio' }
            if (this.preFallbackSettings) {
              restoreSettings.providerId = this.preFallbackSettings.providerId
              restoreSettings.modelId = this.preFallbackSettings.modelId
              this.preFallbackSettings = null // clear after restore
            }
            await this.updateConfig(restoreSettings, true)
            this.stopReconnector()
            return
          }
        }
      } catch (e) {
        // ignore and schedule next
      }

      if (this.reconnectAttempts >= this.reconnectMaxAttempts) {
        const failMsg = 'Voy a sostener una forma alternativa de procesamiento por ahora.'
        this.log('[LLM] ' + failMsg)
        this.notifyUser(failMsg)
        this.stopReconnector()
        return
      }

      // Schedule next attempt
      this.reconnectorTimer = setTimeout(attempt, waitMs)
    }

    // Kickstart first immediate attempt with base delay
    this.reconnectorTimer = setTimeout(attempt, this.reconnectBaseMs)
    this.log('[LLM] LMStudio reconnector started')
  }

  private stopReconnector(): void {
    if (this.reconnectorTimer) {
      clearTimeout(this.reconnectorTimer)
      this.reconnectorTimer = null
      this.reconnectAttempts = 0
      this.log('[LLM] LMStudio reconnector stopped')
    }
  }

  private savePreFallbackSettings(): void {
    if (!this.preFallbackSettings && this.settings.providerId !== 'fallback') {
      this.preFallbackSettings = {
        providerId: this.settings.providerId,
        modelId: this.settings.modelId
      }
      this.log(`[LLM] Saved pre-fallback settings: provider=${this.preFallbackSettings.providerId}, model=${this.preFallbackSettings.modelId}`)
    }
  }

  registerProvider(provider: InferenceProvider): void {
    this.providers.set(provider.id, provider)
    this.log(`[LLM] Registered provider: ${provider.id} (${provider.name})`)
  }

  getProviders(): InferenceProvider[] {
    return Array.from(this.providers.values())
  }

  getSettings(): LLMSettings {
    return { ...this.settings }
  }

  getPreFallbackSettings(): { providerId: string; modelId: string } | null {
    return this.preFallbackSettings
  }

  async updateConfig(newSettings: Partial<LLMSettings>, isFallback = false): Promise<void> {
    const oldProvider = this.settings.providerId
    const oldModel = this.settings.modelId
    
    this.settings = { ...this.settings, ...newSettings }
    await this.saveSettings()

    if (!isFallback) {
      this.preFallbackSettings = null
    }

    if (oldProvider !== this.settings.providerId || oldModel !== this.settings.modelId) {
      this.log(`[LLM] Config updated: provider=${this.settings.providerId}, model=${this.settings.modelId}`)
      this.broadcastStatus()
    }
    
    this.onSyncCallback?.()
  }

  getActiveProvider(): InferenceProvider {
    const provider = this.providers.get(this.settings.providerId)
    if (!provider) {
      // Return local fallback or the first available provider if the active one is missing
      const first = Array.from(this.providers.values())[0]
      if (!first) {
        throw new Error('No LLM inference providers registered in the system')
      }
      return first
    }
    return provider
  }

  getActiveCapabilities(): ProviderCapabilities {
    const provider = this.getActiveProvider()
    return provider.getCapabilities(this.settings.modelId)
  }

  getStatus(): LLMStatus {
    const activeProvider = this.getActiveProvider()
    return {
      providerId: this.settings.providerId,
      modelId: this.settings.modelId,
      allowAutomaticFallback: this.settings.allowAutomaticFallback,
      availableProviders: Array.from(this.providers.values()).map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
      })),
      activeCapabilities: activeProvider.getCapabilities(this.settings.modelId),
    }
  }

  async streamCompletion(
    messages: ChatMessage[],
    options: {
      systemPrompt?: string
      tools?: any[]
      toolChoice?: any
      signal?: AbortSignal
      correlationId: string
    },
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<{ finishReason: string; model: string; providerId: string; latencyMs: number; tokenUsageEstimate: number }> {
    if (!this.initialized) {
      throw new Error('LLM System is not initialized')
    }

    const activeProvider = this.getActiveProvider()
    const activeModel = this.settings.modelId

    try {
      this.log(`[LLM] Routing request via active provider: ${activeProvider.id} (model: ${activeModel})`)
      const res = await activeProvider.streamCompletion(messages, {
        modelId: activeModel,
        systemPrompt: options.systemPrompt,
        tools: options.tools,
        toolChoice: options.toolChoice,
        signal: options.signal,
        correlationId: options.correlationId,
      }, onChunk)

      return {
        ...res,
        providerId: activeProvider.id,
      }
    } catch (err: any) {
      this.logError(`[LLM] Active provider ${activeProvider.id} failed:`, err.message)

      const policyCascade = this.fallbackPolicy === 'cascade'
      const allowFallback = this.settings.allowAutomaticFallback || policyCascade

      if (allowFallback) {
        // If lmstudio failed and policy=cascade, try OpenRouter before offline fallback
        if (activeProvider.id === 'lmstudio' && policyCascade) {
          const open = this.providers.get('openrouter')
          if (open) {
            try {
              const openHealth = await open.healthCheck().catch(() => ({ available: false }))
              if ((openHealth as any).available) {
                const msg = 'Estoy ajustando la forma en la que proceso la informacion para mantenerme agil.'
                this.log('[LLM] ' + msg)
                this.notifyUser(msg)
                this.savePreFallbackSettings()
                await this.updateConfig({ providerId: 'openrouter' }, true)
                // Start reconnector to watch LMStudio
                this.startReconnector()
                // Now route the same request through OpenRouter
                const res = await open.streamCompletion(messages, {
                  modelId: activeModel,
                  systemPrompt: options.systemPrompt,
                  tools: options.tools,
                  toolChoice: options.toolChoice,
                  signal: options.signal,
                  correlationId: options.correlationId,
                }, onChunk)

                return { ...res, providerId: open.id }
              }
            } catch (e) {
              // continue to offline fallback
            }
          }
        }

        // Fallback to offline provider
        const fallbackProvider = this.providers.get('fallback')
        if (fallbackProvider && activeProvider.id !== 'fallback') {
          this.log('[LLM] Attempting fallback to offline provider...')
          this.notifyUser('Voy a utilizar un enfoque mas ligero para sostener la respuesta.')
          // Update configuration / broadcast status
          this.savePreFallbackSettings()
          await this.updateConfig({ providerId: 'fallback', modelId: 'local-offline-fallback' }, true)
          // Yield explicit fallback message to chat flow
          onChunk({ content: `\n\n*(Estoy ajustando mi forma de procesar la informacion para seguir acompanandote.)*\n\n` })
          const res = await fallbackProvider.streamCompletion(messages, {
            modelId: 'local-offline-fallback',
            systemPrompt: options.systemPrompt,
            tools: undefined, // Fallback does not support tools
            toolChoice: undefined,
            signal: options.signal,
            correlationId: options.correlationId,
          }, onChunk)

          return { ...res, providerId: fallbackProvider.id }
        }
      }

      // Re-throw if no fallback was executed or fallback is disabled
      throw err
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const data = await fs.readFile(this.settingsPath, 'utf-8')
      this.settings = { ...DEFAULT_LLM_SETTINGS, ...JSON.parse(data) }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        this.logError('[LLM] Error reading llm-config.json:', err)
      }
      this.settings = { ...DEFAULT_LLM_SETTINGS }
      await this.saveSettings()
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await fs.mkdir(join(this.settingsPath, '..'), { recursive: true })
      const tmpPath = this.settingsPath + '.tmp'
      await fs.writeFile(tmpPath, JSON.stringify(this.settings, null, 2), 'utf-8')
      await fs.rename(tmpPath, this.settingsPath)
    } catch (err: any) {
      this.logError('[LLM] Failed to write llm-config.json:', err)
    }
  }

  private broadcastStatus() {
    try {
      const status = this.getStatus()
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('llm:status', status)
        }
      })
    } catch (e) {}
  }

  private broadcastStatusChangeAlert(alertText: string) {
    try {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('llm:status-alert', alertText)
        }
      })
    } catch (e) {}
  }
}
