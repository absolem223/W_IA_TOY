import type { ToolDefinition, ToolExecutor, RegisteredTool, ToolContext, ToolResult } from './types'

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()

  register(definition: ToolDefinition, executor: ToolExecutor): void {
    this.tools.set(definition.name, { definition, executor })
  }

  getToolDefinitions(): any[] {
    return Array.from(this.tools.values()).map(t => ({
      type: "function",
      function: t.definition
    }))
  }

  async execute(name: string, argsRaw: string, ctx: ToolContext): Promise<ToolResult> {
    const start = Date.now()
    const tool = this.tools.get(name)
    
    if (!tool) {
      ctx.logError(`[TOOL_REGISTRY] Tool not found: ${name}`)
      return { success: false, error: `Tool '${name}' is not registered or not available.` }
    }

    // Capability / Permission Validation
    const hasPermission = tool.definition.capabilities.every(cap => 
      ctx.capabilityCtx.scopes.includes(cap) || ctx.capabilityCtx.scopes.includes('system')
    )
    if (!hasPermission) {
      ctx.logError(`[TOOL_REGISTRY] Permission denied for tool ${name}. Missing capabilities.`)
      return { success: false, error: `Permission denied. Missing required capabilities.` }
    }

    // Require Approval check
    if (tool.definition.requiresApproval && !ctx.capabilityCtx.approvedTools.includes(name)) {
      return { success: false, error: `Execution paused. User approval required for ${name}.` }
    }

    let args: any
    try {
      args = JSON.parse(argsRaw || "{}")
    } catch (e) {
      ctx.logError(`[TOOL_REGISTRY] Invalid JSON arguments for ${name}: ${argsRaw}`)
      return { success: false, error: "Invalid JSON arguments" }
    }

    // Strict Argument Validation
    const props = tool.definition.parameters.properties || {}
    const required = tool.definition.parameters.required || []
    
    // 1. Check required fields
    for (const req of required) {
      if (args[req] === undefined || args[req] === null) {
        return { success: false, error: `Missing required parameter: ${req}` }
      }
    }

    // 2. Reject unknown fields if additionalProperties is false (default true to be safe, but let's enforce if specified)
    if (tool.definition.parameters.additionalProperties === false) {
      const allowedKeys = Object.keys(props)
      const passedKeys = Object.keys(args)
      for (const key of passedKeys) {
        if (!allowedKeys.includes(key)) {
          return { success: false, error: `Unknown parameter provided: ${key}` }
        }
      }
    }

    // 3. Safe Coercion & Sanitization
    const sanitizedArgs: any = {}
    for (const [key, value] of Object.entries(args)) {
      const propDef = props[key]
      if (!propDef) {
         if (tool.definition.parameters.additionalProperties !== false) {
           sanitizedArgs[key] = value // pass through if allowed
         }
         continue
      }
      
      // Basic coercion based on type
      if (propDef.type === 'string' && typeof value !== 'string') {
        sanitizedArgs[key] = String(value)
      } else if (propDef.type === 'number' && typeof value !== 'number') {
        sanitizedArgs[key] = Number(value)
      } else if (propDef.type === 'boolean' && typeof value !== 'boolean') {
        sanitizedArgs[key] = Boolean(value)
      } else {
        sanitizedArgs[key] = value
      }
    }

    try {
      const result = await tool.executor(sanitizedArgs, ctx)
      const latency = Date.now() - start
      ctx.logInfo(`[TOOL_EXECUTION] ${name} completed in ${latency}ms - Success: ${result.success}`)
      return result
    } catch (e: any) {
      const latency = Date.now() - start
      ctx.logError(`[TOOL_EXECUTION] ${name} failed after ${latency}ms:`, e)
      return { success: false, error: e.message ?? "Unknown execution error" }
    }
  }
}

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry()
}
