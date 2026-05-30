import { shell } from 'electron'
import { createServer, Server } from 'http'
import type { LogFn } from '../memory/types'
import { CredentialVault } from '../security/CredentialVault'
import { GoogleScope, GOOGLE_SCOPES_MAP, OAuthSession } from './types'

export class OAuthSessionManager {
  private vault: CredentialVault
  private log: LogFn
  private broadcast: (channel: string, ...args: any[]) => void
  private clientId: string
  private clientSecret: string
  private activeSessions: Map<string, OAuthSession> = new Map()

  constructor(vault: CredentialVault, log: LogFn, broadcast: (channel: string, ...args: any[]) => void) {
    this.vault = vault
    this.log = log
    this.broadcast = broadcast
    // These should ideally come from .env in production
    this.clientId = process.env.GOOGLE_CLIENT_ID || ''
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''
  }

  async loadSessions() {
    try {
      const stored = await this.vault.getSecret('oauth_sessions')
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, OAuthSession>
        for (const [key, val] of Object.entries(parsed)) {
          this.activeSessions.set(key, val)
        }
      }
    } catch (e) {
      this.log(`[OAUTH] Failed to load sessions: ${e}`)
    }
  }

  async saveSessions() {
    const obj = Object.fromEntries(this.activeSessions)
    await this.vault.setSecret('oauth_sessions', JSON.stringify(obj))
  }

  getSession(accountId: string): OAuthSession | undefined {
    return this.activeSessions.get(accountId)
  }

  getAllSessions(): OAuthSession[] {
    return Array.from(this.activeSessions.values())
  }

  async login(requestedScopes: GoogleScope[]): Promise<OAuthSession> {
    if (!this.clientId) {
      throw new Error('Google Client ID is not configured.')
    }

    const scopeUrls = requestedScopes.map(s => GOOGLE_SCOPES_MAP[s]).join(' ')
    const redirectUri = 'http://127.0.0.1:3001/oauth2callback'
    const state = Math.random().toString(36).substring(7)

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
      `client_id=${this.clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopeUrls)}&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${state}`

    return new Promise((resolve, reject) => {
      let server: Server | null = null

      server = createServer(async (req, res) => {
        if (!req.url?.startsWith('/oauth2callback')) {
          res.writeHead(404)
          res.end()
          return
        }

        const url = new URL(req.url, 'http://127.0.0.1:3001')
        const code = url.searchParams.get('code')
        const returnedState = url.searchParams.get('state')

        if (returnedState !== state) {
          res.writeHead(400)
          res.end('State mismatch. You can close this window.')
          server?.close()
          return reject(new Error('OAuth state mismatch'))
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<h1>Authentication successful!</h1><p>You can close this window and return to ArgOS.</p>')
          server?.close()
          
          try {
            const session = await this.exchangeCodeForToken(code, redirectUri, requestedScopes)
            this.activeSessions.set(session.accountId, session)
            await this.saveSessions()
            this.broadcast('oauth:connected', session.accountId)
            resolve(session)
          } catch (e) {
            reject(e)
          }
        } else {
          res.writeHead(400)
          res.end('Authorization code not found. You can close this window.')
          server?.close()
          reject(new Error('No authorization code'))
        }
      })

      server.listen(3001, () => {
        this.log('[OAUTH] Temporary server listening on port 3001 for callback')
        shell.openExternal(authUrl)
      })

      // Timeout after 3 minutes
      setTimeout(() => {
        if (server?.listening) {
          server.close()
          reject(new Error('OAuth login timed out.'))
        }
      }, 3 * 60 * 1000)
    })
  }

  private async exchangeCodeForToken(code: string, redirectUri: string, grantedScopes: GoogleScope[]): Promise<OAuthSession> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })

    if (!res.ok) {
      throw new Error(`Failed to exchange code: ${res.statusText}`)
    }

    const data = await res.json()
    const metadata = await this.fetchProfileMetadata(data.access_token)
    
    return {
      accountId: metadata.email,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      grantedScopes,
      metadata
    }
  }

  private async fetchProfileMetadata(accessToken: string) {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) throw new Error('Failed to fetch user profile.')
    return res.json()
  }

  async getValidAccessToken(accountId: string): Promise<string> {
    const session = this.activeSessions.get(accountId)
    if (!session) throw new Error('No active session for account.')

    if (Date.now() > session.expiresAt - 5 * 60 * 1000) {
      if (!session.refreshToken) {
        this.broadcast('oauth:expired', accountId)
        throw new Error('Access token expired and no refresh token available.')
      }
      return this.refreshAccessToken(session)
    }

    return session.accessToken
  }

  private async refreshAccessToken(session: OAuthSession): Promise<string> {
    this.log(`[OAUTH] Refreshing access token for ${session.accountId}`)
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: session.refreshToken!,
        grant_type: 'refresh_token'
      })
    })

    if (!res.ok) {
      throw new Error(`Failed to refresh token: ${res.statusText}`)
    }

    const data = await res.json()
    session.accessToken = data.access_token
    if (data.refresh_token) {
      session.refreshToken = data.refresh_token
    }
    session.expiresAt = Date.now() + (data.expires_in * 1000)
    
    await this.saveSessions()
    return session.accessToken
  }

  async revoke(accountId: string) {
    const session = this.activeSessions.get(accountId)
    if (session) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${session.accessToken}`, { method: 'POST' })
      } catch (e) {
        this.log(`[OAUTH] Revoke fetch failed, deleting locally anyway: ${e}`)
      }
      this.activeSessions.delete(accountId)
      await this.saveSessions()
      this.broadcast('oauth:revoked', accountId)
    }
  }
}
