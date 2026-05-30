import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export class MediaStorage {
  private cacheDir: string
  private tempDir: string

  constructor() {
    const userData = app.getPath('userData')
    this.cacheDir = join(userData, 'multimedia', 'cache')
    this.tempDir = join(app.getPath('temp'), 'argos-media')
  }

  async initialize() {
    await fs.mkdir(this.cacheDir, { recursive: true })
    await fs.mkdir(this.tempDir, { recursive: true })
  }

  getCachePath(filename: string): string {
    return join(this.cacheDir, filename)
  }

  async createTempWorkspace(jobId: string): Promise<string> {
    const workspace = join(this.tempDir, jobId)
    await fs.mkdir(workspace, { recursive: true })
    return workspace
  }

  async cleanupWorkspace(jobId: string): Promise<void> {
    const workspace = join(this.tempDir, jobId)
    try {
      await fs.rm(workspace, { recursive: true, force: true })
    } catch (e) {
      console.warn(`[MEDIA_STORAGE] Failed to cleanup workspace ${workspace}: ${e}`)
    }
  }

  async clearOrphans(): Promise<void> {
    try {
      const dirs = await fs.readdir(this.tempDir)
      for (const d of dirs) {
        await fs.rm(join(this.tempDir, d), { recursive: true, force: true })
      }
    } catch (e) {
      // Ignored
    }
  }
}

export const globalMediaStorage = new MediaStorage()
