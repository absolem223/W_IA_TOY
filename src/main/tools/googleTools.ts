import type { ToolRegistry } from './ToolRegistry'
import type { GoogleScope } from '../oauth/types'
import type { OAuthSessionManager } from '../oauth/OAuthSessionManager'

// We need a way to access the oauthManager from tools.
// We can extend ToolContext.
export interface GoogleToolContext {
  oauthManager?: OAuthSessionManager
}

export function registerGoogleTools(registry: ToolRegistry) {
  registry.register(
  {
    name: 'google_login',
    description: "Triggers a Google OAuth login flow in the user's browser. Use this when the user asks you to log in to Google or connect their account.",
    parameters: {
      type: "object",
      properties: {
        scopes: {
          type: "array",
          items: { type: "string" },
          description: "List of scopes to request. Currently only 'profile.basic' is supported."
        }
      },
      additionalProperties: false
    },
    capabilities: ['system'],
    requiresApproval: true,
    isTrusted: true
  },
  async (args, ctx: any) => {
    if (!ctx.oauthManager) {
      return { success: false, error: 'OAuth Manager not available.' }
    }
    const requestedScopes: GoogleScope[] = args.scopes || ['profile.basic']
    
    // For now, only allow profile.basic as requested.
    if (!requestedScopes.every(s => s === 'profile.basic')) {
      return { success: false, error: 'Only profile.basic scope is allowed in this phase.' }
    }

    try {
      const session = await ctx.oauthManager.login(requestedScopes)
      return { 
        success: true, 
        message: `Successfully connected Google account: ${session.metadata.email}` 
      }
    } catch (e: any) {
      return { success: false, error: `Login failed: ${e.message}` }
    }
  }
  )

  registry.register(
  {
    name: 'google_get_profile',
    description: "Fetches the basic Google profile metadata for a connected account.",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "The email address of the connected account" }
      },
      required: ["accountId"],
      additionalProperties: false
    },
    capabilities: ['network:read'],
    requiresApproval: false,
    isTrusted: true
  },
  async (args, ctx: any) => {
    if (!ctx.oauthManager) {
      return { success: false, error: 'OAuth Manager not available.' }
    }
    
    try {
      const token = await ctx.oauthManager.getValidAccessToken(args.accountId)
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to fetch user profile.')
      const data = await res.json()
      
      return { success: true, data }
    } catch (e: any) {
      return { success: false, error: `Profile fetch failed: ${e.message}` }
    }
  }
)
}
