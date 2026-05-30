import { join } from 'path'
import { promises as fs } from 'fs'
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
      this.initialized = true
      this.log(`[LLM] Initialized. Provider: ${this.settings.providerId}, Model: ${this.settings.modelId}`)
    } catch (err: any) {
      this.logError('[LLM] Initialization failed:', err)
      this.initialized = false
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

  async updateConfig(newSettings: Partial<LLMSettings>): Promise<void> {
    const oldProvider = this.settings.providerId
    const oldModel = this.settings.modelId
    
    this.settings = { ...this.settings, ...newSettings }
    await this.saveSettings()

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

      if (this.settings.allowAutomaticFallback) {
        // Fallback provider path
        const fallbackProvider = this.providers.get('fallback')
        if (fallbackProvider && activeProvider.id !== 'fallback') {
          this.log('[LLM] Attempting fallback to offline provider...')
          
          // Notify the UI/Renderer of dynamic switch to ensure transparency
          this.broadcastStatusChangeAlert(
            `⚠️ Error en proveedor '${activeProvider.name}'. Cambiando a modo de emergencia sin conexión.`
          )

          // Yield explicit fallback message to chat flow
          onChunk({
            content: `\n\n*(⚠️ Conexión perdida con ${activeProvider.name}. Se activó el modo de emergencia local sin conexión)*\n\n`
          })

          const res = await fallbackProvider.streamCompletion(messages, {
            modelId: 'local-offline-fallback',
            systemPrompt: options.systemPrompt,
            tools: undefined, // Fallback does not support tools
            toolChoice: undefined,
            signal: options.signal,
            correlationId: options.correlationId,
          }, onChunk)

          return {
            ...res,
            providerId: fallbackProvider.id,
          }
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
