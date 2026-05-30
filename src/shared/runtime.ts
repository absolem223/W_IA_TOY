export type ProviderKind = 'local' | 'remote'
export type ProviderCategory = 'reasoning' | 'embedding'
export type AuthState = 'valid' | 'missing' | 'malformed' | 'invalid'
export type RuntimeErrorType =
  | 'auth_error'
  | 'provider_offline'
  | 'timeout'
  | 'malformed_request'
  | 'rate_limit'
  | 'invalid_model'
  | 'network_failure'
  | 'unknown'

export interface EnvironmentWarning {
  id: string
  type: 'missing_key' | 'empty_key' | 'invalid_endpoint' | 'provider_disabled' | 'configuration'
  message: string
  providerId?: string
}

export interface ProviderConfig {
  id: string
  label: string
  kind: ProviderKind
  category: ProviderCategory
  baseUrl: string
  requiredApiKey: boolean
  enabled: boolean
  supportsFallback: boolean
  healthCheckPath: string
}

export interface ProviderStatus {
  id: string
  label: string
  kind: ProviderKind
  category: ProviderCategory
  online: boolean
  authenticated: boolean
  authState: AuthState
  endpointValid: boolean
  failureCount: number
  successCount: number
  lastLatencyMs: number | null
  lastCheckedAt: number | null
  fallbackActive: boolean
  modelRouting: string | null
  error?: string
}

export interface ProviderErrorRecord {
  providerId: string
  type: RuntimeErrorType
  message: string
  timestamp: number
}

export interface RuntimeStatusReport {
  inferenceProvider: string
  embeddingProvider: string
  authState: AuthState
  lastSuccessfulRequestAt: number | null
  failedRequests: number
  fallbackActive: boolean
  activeModel: string | null
  tokenUsageEstimate: number
  providerErrors: ProviderErrorRecord[]
  providers: ProviderStatus[]
  environmentWarnings: EnvironmentWarning[]
}
