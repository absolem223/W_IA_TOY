export type Capability = 
  | 'fs:read' 
  | 'fs:write' 
  | 'fs:delete' 
  | 'shell:exec' 
  | 'net:fetch' 
  | 'memory:read' 
  | 'memory:write'
  | 'voice:play'
  | 'system:config'

export interface PermissionRequest {
  capability: Capability
  scope: string // e.g., '/workspace/docs/file.txt' or 'api.github.com'
  origin: string // e.g., 'command:/rm', 'agent:auto', 'user:ui'
  justification?: string
}

export interface GrantedPermission {
  id: string
  capability: Capability
  scope: string
  origin: string
  grantedAt: number
  expiresAt?: number
  revoked: boolean
}

export interface AuditEvent {
  timestamp: string
  type: 'access_denied' | 'access_granted' | 'permission_requested' | 'permission_revoked' | 'system_alert'
  capability: Capability
  scope: string
  origin: string
  details?: Record<string, unknown>
}
