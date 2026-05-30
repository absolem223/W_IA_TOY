import type { MemoryManager } from '../memory/MemoryManager'

export type PermissionScope = 
  | 'system' 
  | 'memory:read' 
  | 'memory:write' 
  | 'network:read' 
  | 'filesystem:read' 
  | 'filesystem:write' 
  | 'multimedia:process'
  | 'search.web'
  | 'youtube.readonly'

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, any>
    required?: string[]
    additionalProperties?: boolean
  }
  capabilities: PermissionScope[]
  requiresApproval: boolean
  isTrusted: boolean
  executionPolicy?: 'replayable' | 'recoverable' | 'requires-confirmation'
}

export interface ToolResult {
  success: boolean
  message?: string
  data?: any
  error?: string
}

export interface CapabilityContext {
  scopes: PermissionScope[]
  approvedTools: string[]
}

export interface ToolContext {
  memoryManager?: MemoryManager
  capabilityCtx: CapabilityContext
  logInfo: (msg: string) => void
  logError: (msg: string, err?: any) => void
}

export type ToolExecutor = (args: any, ctx: ToolContext) => Promise<ToolResult>

export interface RegisteredTool {
  definition: ToolDefinition
  executor: ToolExecutor
}
