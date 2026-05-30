import { randomUUID } from 'crypto'
import type { Capability, GrantedPermission, PermissionRequest } from './types'
import { AuditLogger } from './AuditLogger'
import { Sandbox } from './Sandbox'

export class PermissionManager {
  private granted = new Map<string, GrantedPermission>()
  private audit = new AuditLogger()
  private sandbox = new Sandbox()

  /**
   * Pide un permiso explícito. En modo "safe runtime", debe denegarse por defecto 
   * salvo que exista una política pre-aprobada o requiera prompt visual.
   */
  public async request(req: PermissionRequest): Promise<boolean> {
    // 1. Enforcing Sandbox for FileSystem operations
    if (req.capability.startsWith('fs:')) {
      if (!this.sandbox.isPathAllowed(req.scope)) {
        this.audit.log({
          type: 'access_denied',
          capability: req.capability,
          origin: req.origin,
          scope: req.scope,
          details: { reason: 'Sandbox violation' }
        })
        return false
      }
    }

    // 2. Check existing active grants
    const existing = Array.from(this.granted.values()).find(
      p => p.capability === req.capability && p.scope === req.scope && p.origin === req.origin && !p.revoked
    )

    if (existing) {
      this.audit.log({
        type: 'access_granted',
        capability: req.capability,
        origin: req.origin,
        scope: req.scope,
        details: { reason: 'Previously granted', id: existing.id }
      })
      return true
    }

    // 3. Fallback to Deny-All (Safe Runtime Default)
    // To allow, the system would need to invoke a visual UI confirmation prompt here via IPC.
    // Since this is a programmatic request, if we don't have it, we deny it, EXCEPT 
    // for specific internal auto-allowed systems (to be defined).
    
    // For now, deny everything not pre-granted.
    this.audit.log({
      type: 'access_denied',
      capability: req.capability,
      origin: req.origin,
      scope: req.scope,
      details: { reason: 'No explicit grant found' }
    })

    return false
  }

  /**
   * Otorga un permiso explícitamente (usualmente después de una confirmación visual de UI)
   */
  public grant(req: PermissionRequest, durationMs?: number): string {
    const id = randomUUID()
    
    this.granted.set(id, {
      id,
      capability: req.capability,
      scope: req.scope,
      origin: req.origin,
      grantedAt: Date.now(),
      expiresAt: durationMs ? Date.now() + durationMs : undefined,
      revoked: false
    })

    this.audit.log({
      type: 'permission_requested', // technically it was requested and manually approved
      capability: req.capability,
      origin: req.origin,
      scope: req.scope,
      details: { action: 'granted', id }
    })

    return id
  }

  public revoke(id: string): void {
    const perm = this.granted.get(id)
    if (perm && !perm.revoked) {
      perm.revoked = true
      this.audit.log({
        type: 'permission_revoked',
        capability: perm.capability,
        origin: 'system',
        scope: perm.scope,
        details: { id }
      })
    }
  }

  public getActivePermissions(): GrantedPermission[] {
    return Array.from(this.granted.values()).filter(p => !p.revoked)
  }
}

export const permissionManager = new PermissionManager()
