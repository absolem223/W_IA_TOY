import type { EnvironmentWarning, ProviderConfig, ProviderStatus, RuntimeErrorType, RuntimeStatusReport } from '../shared/runtime'

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function summarizeAuthState(hasApiKey: boolean, providerRequiresKey: boolean, apiKeyValue?: string): EnvironmentWarning['type'] {
  if (!providerRequiresKey) return 'configuration'
  if (!hasApiKey) return 'missing_key'
  if (apiKeyValue?.trim().length === 0) return 'empty_key'
  return 'configuration'
}

function classifyErrorType(statusCode?: number, err?: Error): RuntimeErrorType {
  if (statusCode === 401 || statusCode === 403) return 'auth_error'
  if (statusCode === 408 || statusCode === 504) return 'timeout'
  if (statusCode === 429) return 'rate_limit'
  if (statusCode === 404) return 'invalid_model'
  if (err?.message?.includes('network')) return 'network_failure'
  if (err?.message?.includes('body')) return 'malformed_request'
  return 'unknown'
}

function buildHealthUrl(baseUrl: string, path: string): string {
  try {
    return new URL(path, baseUrl).toString()
  } catch {
    return baseUrl
  }
}

export class ProviderDiagnostics {
  private apiKey: string | undefined
  private baseUrl: string
  private providerConfigs: ProviderConfig[]
  private status: RuntimeStatusReport
  private warnings: EnvironmentWarning[] = []

  constructor(private readonly logInfo: (...args: any[]) => void, private readonly logError: (...args: any[]) => void) {
    this.apiKey = process.env.API_KEY?.trim()
    this.baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || OPENROUTER_DEFAULT_BASE_URL
    this.providerConfigs = [
      {
        id: 'openrouter-chat',
        label: 'OpenRouter Reasoning',
        kind: 'remote',
        category: 'reasoning',
        baseUrl: this.baseUrl,
        requiredApiKey: true,
        enabled: true,
        supportsFallback: true,
        healthCheckPath: 'models',
      },
      {
        id: 'local-embedding',
        label: 'Local Embedding Provider',
        kind: 'local',
        category: 'embedding',
        baseUrl: 'local://hash-embedding',
        requiredApiKey: false,
        enabled: true,
        supportsFallback: false,
        healthCheckPath: '',
      },
      {
        id: 'local-fallback',
        label: 'Local Offline Fallback',
        kind: 'local',
        category: 'reasoning',
        baseUrl: 'local://offline-fallback',
        requiredApiKey: false,
        enabled: true,
        supportsFallback: true,
        healthCheckPath: '',
      },
    ]

    this.status = {
      inferenceProvider: 'openrouter-chat',
      embeddingProvider: 'local-embedding',
      authState: this.apiKey ? 'valid' : 'missing',
      lastSuccessfulRequestAt: null,
      failedRequests: 0,
      fallbackActive: false,
      activeModel: null,
      tokenUsageEstimate: 0,
      providerErrors: [],
      providers: this.providerConfigs.map(config => this.createInitialProviderStatus(config)),
      environmentWarnings: [],
    }
  }

  private createInitialProviderStatus(config: ProviderConfig): ProviderStatus {
    const authenticated = config.requiredApiKey ? Boolean(this.apiKey) : true
    return {
      id: config.id,
      label: config.label,
      kind: config.kind,
      category: config.category,
      online: config.kind === 'local',
      authenticated,
      authState: config.requiredApiKey ? (authenticated ? 'valid' : 'missing') : 'valid',
      endpointValid: config.kind === 'remote' ? isValidUrl(config.baseUrl) : true,
      failureCount: 0,
      successCount: 0,
      lastLatencyMs: null,
      lastCheckedAt: null,
      fallbackActive: false,
      modelRouting: null,
    }
  }

  public validateEnvironment(): EnvironmentWarning[] {
    this.warnings = []

    const hasApiKey = Boolean(this.apiKey)
    if (!hasApiKey) {
      this.warnings.push({
        id: 'or-missing-key',
        type: 'missing_key',
        message: 'Falta API_KEY en .env. OpenRouter no podrá autenticarse.',
        providerId: 'openrouter-chat',
      })
    }

    if (process.env.API_KEY !== undefined && process.env.API_KEY.trim().length === 0) {
      this.warnings.push({
        id: 'or-empty-key',
        type: 'empty_key',
        message: 'API_KEY existe pero está vacía. Verificá el archivo .env.',
        providerId: 'openrouter-chat',
      })
    }

    if (process.env.OPENROUTER_BASE_URL && !isValidUrl(process.env.OPENROUTER_BASE_URL.trim())) {
      this.warnings.push({
        id: 'or-invalid-base-url',
        type: 'invalid_endpoint',
        message: `OPENROUTER_BASE_URL inválido: ${process.env.OPENROUTER_BASE_URL}`,
        providerId: 'openrouter-chat',
      })
    }

    if (!isValidUrl(this.baseUrl)) {
      this.warnings.push({
        id: 'or-invalid-default-base-url',
        type: 'invalid_endpoint',
        message: `La URL base de OpenRouter no es válida: ${this.baseUrl}`,
        providerId: 'openrouter-chat',
      })
    }

    if (!this.providerConfigs.some(cfg => cfg.enabled)) {
      this.warnings.push({
        id: 'provider-config',
        type: 'provider_disabled',
        message: 'No hay proveedores habilitados en la configuración del runtime.',
      })
    }

    this.status.environmentWarnings = [...this.warnings]
    return this.warnings
  }

  public async initialize(): Promise<void> {
    this.validateEnvironment()
    await this.performHealthChecks()
  }

  public getStatus(): RuntimeStatusReport {
    return {
      ...this.status,
      providers: this.status.providers.map(provider => ({ ...provider })),
      providerErrors: [...this.status.providerErrors],
      environmentWarnings: [...this.status.environmentWarnings],
    }
  }

  private async performHealthChecks(): Promise<void> {
    await Promise.all(this.providerConfigs.map(async (config) => {
      if (!config.enabled) return
      if (config.kind === 'local') {
        this.updateProviderStatus(config.id, {
          online: true,
          lastCheckedAt: Date.now(),
        })
        return
      }

      if (!config.baseUrl || !isValidUrl(config.baseUrl)) {
        this.updateProviderStatus(config.id, {
          endpointValid: false,
          online: false,
          error: 'URL de provider inválida',
          authState: this.apiKey ? 'valid' : 'missing',
          lastCheckedAt: Date.now(),
        })
        return
      }

      const healthUrl = buildHealthUrl(config.baseUrl, config.healthCheckPath)
      const headers = this.buildAuthHeaders(config)
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 7000)
        const response = await fetch(healthUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        })
        clearTimeout(timeout)

        const online = response.ok
        const authState = response.status === 401 || response.status === 403 ? 'invalid' : (config.requiredApiKey ? (this.apiKey ? 'valid' : 'missing') : 'valid')
        const error = online ? undefined : `Health check falló: ${response.status}`

        this.updateProviderStatus(config.id, {
          online,
          authenticated: config.requiredApiKey ? Boolean(this.apiKey) : true,
          authState,
          endpointValid: true,
          error,
          lastCheckedAt: Date.now(),
          lastLatencyMs: response.ok ? 0 : null,
        })
      } catch (err) {
        const errorType = classifyErrorType(undefined, err instanceof Error ? err : new Error(String(err)))
        this.updateProviderStatus(config.id, {
          online: false,
          authenticated: config.requiredApiKey ? Boolean(this.apiKey) : true,
          authState: config.requiredApiKey ? (this.apiKey ? 'valid' : 'missing') : 'valid',
          endpointValid: true,
          error: `Health check error: ${err instanceof Error ? err.message : String(err)}`,
          lastCheckedAt: Date.now(),
        })
        this.logError('[PROVIDER_DIAGNOSTICS] Health check failure:', config.id, err)
        this.recordFailure(config.id, errorType, err instanceof Error ? err.message : String(err))
      }
    }))
  }

  private buildAuthHeaders(config: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (config.requiredApiKey && this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`
    }
    return headers
  }

  private updateProviderStatus(providerId: string, partial: Partial<ProviderStatus>): void {
    const index = this.status.providers.findIndex(p => p.id === providerId)
    if (index < 0) return
    this.status.providers[index] = { ...this.status.providers[index], ...partial }
  }

  public detectIncomingAuthHeader(value: string | string[] | undefined): 'missing' | 'malformed' | 'valid' {
    if (!value) return 'missing'
    const bearer = Array.isArray(value) ? value[0] : value
    if (!bearer.toLowerCase().startsWith('bearer ')) return 'malformed'
    const token = bearer.slice(7).trim()
    if (!token) return 'malformed'
    return 'valid'
  }

  public recordRequestStart(providerId: string, model: string | null): void {
    const provider = this.status.providers.find(p => p.id === providerId)
    if (provider) {
      provider.modelRouting = model
      provider.lastCheckedAt = Date.now()
      provider.fallbackActive = false
    }
    this.status.activeModel = model
  }

  public recordSuccess(providerId: string, latencyMs: number): void {
    const provider = this.status.providers.find(p => p.id === providerId)
    if (provider) {
      provider.successCount += 1
      provider.lastLatencyMs = latencyMs
      provider.lastCheckedAt = Date.now()
      provider.online = true
      provider.error = undefined
    }
    this.status.lastSuccessfulRequestAt = Date.now()
    this.status.fallbackActive = false
  }

  public recordFailure(providerId: string, errorType: RuntimeErrorType, message: string): void {
    const provider = this.status.providers.find(p => p.id === providerId)
    if (provider) {
      provider.failureCount += 1
      provider.online = false
      provider.error = message
      provider.lastCheckedAt = Date.now()
    }
    this.status.failedRequests += 1
    this.status.providerErrors.unshift({ providerId, type: errorType, message, timestamp: Date.now() })
    if (this.status.providerErrors.length > 20) {
      this.status.providerErrors.pop()
    }
  }

  public setFallbackActive(active: boolean): void {
    this.status.fallbackActive = active
    const fallbackProvider = this.status.providers.find(p => p.id === 'local-fallback')
    if (fallbackProvider) {
      fallbackProvider.fallbackActive = active
    }
  }

  public recordTokenUsage(tokenChars: number): void {
    this.status.tokenUsageEstimate += Math.max(1, Math.ceil(tokenChars / 4))
  }
}
