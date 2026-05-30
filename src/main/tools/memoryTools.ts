import type { ToolRegistry } from './ToolRegistry'

export function registerMemoryTools(registry: ToolRegistry) {
  registry.register(
  {
    name: 'update_assistant_identity',
    description: "Updates the assistant's own identity (e.g. name or role). Use this if the user explicitly asks you to change your name or persona.",
    parameters: {
      type: "object",
      properties: {
        assistant_name: { type: "string", description: "The new name of the assistant" },
        assistant_role: { type: "string", description: "The new role (e.g., 'companion', 'developer')" },
        speaking_style: { type: "string", description: "The speaking style (e.g., 'warm', 'technical')" }
      },
      additionalProperties: false
    },
    capabilities: ['memory:write'],
    requiresApproval: false,
    isTrusted: true
  },
  async (args, ctx) => {
    if (!ctx.memoryManager) {
      return { success: false, error: 'Memory manager not available.' }
    }
    await ctx.memoryManager.updateAssistantProfile(args)
    return { success: true, message: 'Assistant identity updated successfully.' }
  }
  )

  registry.register(
  {
    name: 'update_user_profile',
    description: "Updates the user's explicit profile information (e.g. user name, preferences).",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "The property key (e.g., 'user_name', 'preferences')" },
        value: { type: "string", description: "The property value" }
      },
      required: ["key", "value"],
      additionalProperties: false
    },
    capabilities: ['memory:write'],
    requiresApproval: false,
    isTrusted: true
  },
  async (args, ctx) => {
    if (!ctx.memoryManager) {
      return { success: false, error: 'Memory manager not available.' }
    }
    if (!args.key || !args.value) {
      return { success: false, error: 'Missing key or value' }
    }
    await ctx.memoryManager.updateProfile(args.key, args.value)
    return { success: true, message: `User profile '${args.key}' updated successfully.` }
  }
)
}
