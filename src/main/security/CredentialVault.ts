import { safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { LogFn } from '../memory/types'

export class CredentialVault {
  private filePath: string
  private logInfo: LogFn

  constructor(userDataPath: string, logInfo: LogFn) {
    this.filePath = join(userDataPath, 'security', 'vault.enc')
    this.logInfo = logInfo
  }

  async initialize() {
    try {
      await fs.mkdir(join(this.filePath, '..'), { recursive: true })
    } catch {
      // Ignored
    }
  }

  async setSecret(key: string, value: string): Promise<void> {
    const data = await this.readAll()
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value)
      data[key] = encrypted.toString('base64')
    } else {
      this.logInfo('[CREDENTIAL_VAULT] Warning: Encryption not available, storing in plain text.')
      data[key] = value
    }
    await this.writeAll(data)
  }

  async getSecret(key: string): Promise<string | null> {
    const data = await this.readAll()
    const value = data[key]
    if (!value) return null

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(value, 'base64')
        return safeStorage.decryptString(buffer)
      } catch (err) {
        this.logInfo(`[CREDENTIAL_VAULT] Error decrypting secret for ${key}: ${err}`)
        return null
      }
    } else {
      return value
    }
  }

  async deleteSecret(key: string): Promise<void> {
    const data = await this.readAll()
    delete data[key]
    await this.writeAll(data)
  }

  private async readAll(): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }

  private async writeAll(data: Record<string, string>): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(data), 'utf-8')
  }
}
