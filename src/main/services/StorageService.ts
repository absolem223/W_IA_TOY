import { app } from 'electron'
import { join } from 'path'

export class StorageService {
  private static _userDataPath: string | null = null

  /**
   * Initializes the persistent storage system.
   * Can be passed a custom path for testing purposes.
   * Also sets Electron's internal 'userData' path so that all native systems are aligned.
   */
  public static initialize(customPath?: string): void {
    if (customPath) {
      this._userDataPath = customPath
    } else {
      let appData = ''
      try {
        appData = app.getPath('appData')
      } catch {
        // Safe cross-platform fallback for testing environments outside Electron runtime
        appData = process.env.APPDATA || 
          (process.platform === 'darwin' 
            ? join(process.env.HOME || '', 'Library', 'Application Support') 
            : join(process.env.HOME || '', '.config'))
      }
      this._userDataPath = join(appData, 'argos')
    }
    
    // Synchronize Electron's app directory path if available
    try {
      app.setPath('userData', this._userDataPath)
    } catch {
      // Ignored when running in tests outside Electron main process
    }
  }

  /**
   * Returns the main AppData directory for the application (SSOT userData).
   */
  public static getUserDataPath(): string {
    if (!this._userDataPath) {
      let appData = ''
      try {
        appData = app.getPath('appData')
      } catch {
        appData = process.env.APPDATA || 
          (process.platform === 'darwin' 
            ? join(process.env.HOME || '', 'Library', 'Application Support') 
            : join(process.env.HOME || '', '.config'))
      }
      this._userDataPath = join(appData, 'argos')
    }
    return this._userDataPath
  }

  /**
   * Returns the directory path for the semantic and working memory layers.
   */
  public static getMemoryPath(): string {
    return join(this.getUserDataPath(), 'memory')
  }

  /**
   * Returns the directory path for secure keys and encrypted credentials.
   */
  public static getSecurityPath(): string {
    return join(this.getUserDataPath(), 'security')
  }

  /**
   * Returns the absolute file path for the primary SQLite knowledge database.
   */
  public static getDatabasePath(): string {
    return join(this.getUserDataPath(), 'knowledge.sqlite')
  }

  /**
   * Returns the directory path for system configuration files.
   */
  public static getConfigPath(): string {
    return join(this.getUserDataPath(), 'config')
  }

  /**
   * Returns the directory path for the logger subsystem files.
   */
  public static getLogsPath(): string {
    return join(this.getUserDataPath(), 'logs')
  }
}
