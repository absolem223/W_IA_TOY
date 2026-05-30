import { promises as fs, existsSync } from 'fs'
import { join, relative, dirname } from 'path'
import { createHash } from 'crypto'
import Database from 'better-sqlite3'
import { StorageService } from './StorageService'

export interface MigratedFileRecord {
  relativeSrc: string;
  absoluteSrc: string;
  absoluteDst: string;
  size: number;
  sha256: string;
  verified: boolean;
}

export interface MigrationState {
  version: number;
  timestamp: number;
  status: 'success' | 'failed' | 'skipped';
  migratedFiles: {
    relativeSrc: string;
    size: number;
    sha256: string;
  }[];
  sqliteIntegrity: string;
  errors: string[];
}

export class DataMigrator {
  private static MIGRATION_VERSION = 1
  private static STATE_FILE_NAME = 'migration-state.json'
  private static REPORT_FILE_NAME = 'MIGRATION_VALIDATION.md'

  /**
   * Scans for a previous widget-ia-toy installation and safely migrates 
   * the persistent profile data to the new argos storage directory.
   */
  public static async migrate(
    oldUserDataPath: string,
    newUserDataPath: string,
    logInfo: (msg: string) => void,
    logError: (msg: string, err?: any) => void
  ): Promise<{ migrated: boolean; state?: MigrationState }> {
    const stateFilePath = join(newUserDataPath, this.STATE_FILE_NAME)
    const reportFilePath = join(newUserDataPath, this.REPORT_FILE_NAME)

    // 1. Check if a successful migration for this version has already run
    if (existsSync(stateFilePath)) {
      try {
        const rawState = await fs.readFile(stateFilePath, 'utf-8')
        const state = JSON.parse(rawState) as MigrationState
        if (state.version === this.MIGRATION_VERSION && state.status === 'success') {
          logInfo('[DATA_MIGRATOR] Migration already completed successfully for version 1. Skipping.')
          return { migrated: false, state }
        }
      } catch (err: any) {
        logError('[DATA_MIGRATOR] Failed reading existing migration-state.json, re-evaluating.', err)
      }
    }

    // 2. Check if a previous installation exists
    if (!existsSync(oldUserDataPath)) {
      logInfo(`[DATA_MIGRATOR] No old installation found at ${oldUserDataPath}. Marking migration as skipped.`)
      const skippedState: MigrationState = {
        version: this.MIGRATION_VERSION,
        timestamp: Date.now(),
        status: 'skipped',
        migratedFiles: [],
        sqliteIntegrity: 'N/A',
        errors: []
      }
      await fs.mkdir(newUserDataPath, { recursive: true })
      await fs.writeFile(stateFilePath, JSON.stringify(skippedState, null, 2), 'utf-8')
      return { migrated: true, state: skippedState }
    }

    logInfo(`[DATA_MIGRATOR] Old installation detected at ${oldUserDataPath}. Initiating migration...`)
    
    const migratedFiles: MigratedFileRecord[] = []
    const errors: string[] = []
    let sqliteIntegrity = 'unknown'

    try {
      // Create target directory
      await fs.mkdir(newUserDataPath, { recursive: true })

      // ── Category A: Memory ──
      const srcMemory = join(oldUserDataPath, 'memory')
      const dstMemory = StorageService.getMemoryPath()
      logInfo('[DATA_MIGRATOR] Migrating memory layer recursively...')
      await this.copyAndVerifyDirectory(srcMemory, dstMemory, 'memory', migratedFiles, errors, logInfo)

      // ── Category B: Security ──
      const srcSecurity = join(oldUserDataPath, 'security')
      const dstSecurity = StorageService.getSecurityPath()
      logInfo('[DATA_MIGRATOR] Migrating security vault credentials...')
      await this.copyAndVerifyDirectory(srcSecurity, dstSecurity, 'security', migratedFiles, errors, logInfo)

      // ── Category C: Database ──
      // Copy sqlite file at the root
      const srcDbFile = join(oldUserDataPath, 'knowledge.sqlite')
      const dstDbFile = StorageService.getDatabasePath()
      if (existsSync(srcDbFile)) {
        logInfo('[DATA_MIGRATOR] Migrating SQLite database file...')
        await this.copyAndVerifyFile(srcDbFile, dstDbFile, 'knowledge.sqlite', migratedFiles, errors)
        
        // SQLite PRAGMA integrity check validation
        logInfo('[DATA_MIGRATOR] Performing SQLite low-level integrity check...')
        const dbCheck = await this.verifySQLiteIntegrity(dstDbFile)
        if (dbCheck.ok) {
          sqliteIntegrity = 'ok'
          logInfo('[DATA_MIGRATOR] SQLite database integrity verified: OK')
        } else {
          sqliteIntegrity = `failed: ${dbCheck.error}`
          errors.push(`SQLite database integrity check failed: ${dbCheck.error}`)
          logError(`[DATA_MIGRATOR] SQLite integrity failure: ${dbCheck.error}`)
        }
      }

      // Copy db/ folder if exists
      const srcDbDir = join(oldUserDataPath, 'db')
      const dstDbDir = join(newUserDataPath, 'db')
      if (existsSync(srcDbDir)) {
        logInfo('[DATA_MIGRATOR] Migrating SQLite auxiliary db directory...')
        await this.copyAndVerifyDirectory(srcDbDir, dstDbDir, 'db', migratedFiles, errors, logInfo)
      }

      // ── Category D: Config ──
      // Copy JSON files in root
      const configFiles = ['llm-config.json', 'voice-config.json']
      for (const configFile of configFiles) {
        const srcCfg = join(oldUserDataPath, configFile)
        const dstCfg = join(newUserDataPath, configFile)
        if (existsSync(srcCfg)) {
          logInfo(`[DATA_MIGRATOR] Migrating config file ${configFile}...`)
          await this.copyAndVerifyFile(srcCfg, dstCfg, configFile, migratedFiles, errors)
        }
      }

      // Copy config/ folder if exists
      const srcCfgDir = join(oldUserDataPath, 'config')
      const dstCfgDir = StorageService.getConfigPath()
      if (existsSync(srcCfgDir)) {
        logInfo('[DATA_MIGRATOR] Migrating config directory recursively...')
        await this.copyAndVerifyDirectory(srcCfgDir, dstCfgDir, 'config', migratedFiles, errors, logInfo)
      }

      // 3. Write Migration Validation Report (MIGRATION_VALIDATION.md)
      const hasErrors = errors.length > 0
      const status: 'success' | 'failed' = hasErrors ? 'failed' : 'success'
      
      logInfo(`[DATA_MIGRATOR] Writing validation report to ${reportFilePath}...`)
      await this.generateValidationReport(
        reportFilePath,
        oldUserDataPath,
        newUserDataPath,
        status,
        migratedFiles,
        sqliteIntegrity,
        errors
      )

      // 4. Save state file (migration-state.json)
      const finalState: MigrationState = {
        version: this.MIGRATION_VERSION,
        timestamp: Date.now(),
        status,
        migratedFiles: migratedFiles.map(f => ({
          relativeSrc: f.relativeSrc,
          size: f.size,
          sha256: f.sha256
        })),
        sqliteIntegrity,
        errors
      }
      await fs.writeFile(stateFilePath, JSON.stringify(finalState, null, 2), 'utf-8')
      logInfo(`[DATA_MIGRATOR] Migration finished with status: ${status.toUpperCase()}. State file saved.`)
      
      return { migrated: true, state: finalState }

    } catch (err: any) {
      logError('[DATA_MIGRATOR] Uncaught error during migration process:', err)
      const failedState: MigrationState = {
        version: this.MIGRATION_VERSION,
        timestamp: Date.now(),
        status: 'failed',
        migratedFiles: migratedFiles.map(f => ({
          relativeSrc: f.relativeSrc,
          size: f.size,
          sha256: f.sha256
        })),
        sqliteIntegrity,
        errors: [...errors, err.message]
      }
      try {
        await fs.writeFile(stateFilePath, JSON.stringify(failedState, null, 2), 'utf-8')
      } catch {}
      throw err
    }
  }

  private static async copyAndVerifyDirectory(
    srcDir: string,
    dstDir: string,
    category: string,
    migratedFiles: MigratedFileRecord[],
    errors: string[],
    logInfo: (msg: string) => void
  ): Promise<void> {
    if (!existsSync(srcDir)) return

    await fs.mkdir(dstDir, { recursive: true })
    await fs.cp(srcDir, dstDir, { recursive: true, force: true })

    const files = await this.getAllFilesRecursively(srcDir)
    for (const file of files) {
      const rel = relative(srcDir, file)
      const dstFile = join(dstDir, rel)

      try {
        const srcStat = await fs.stat(file)
        const dstStat = await fs.stat(dstFile)

        const srcHash = await this.calculateSHA256(file)
        const dstHash = await this.calculateSHA256(dstFile)

        const verified = srcStat.size === dstStat.size && srcHash === dstHash

        migratedFiles.push({
          relativeSrc: join(category, rel).replace(/\\/g, '/'),
          absoluteSrc: file,
          absoluteDst: dstFile,
          size: srcStat.size,
          sha256: dstHash,
          verified
        })

        if (!verified) {
          errors.push(`Integrity mismatch for ${rel} (Size: ${srcStat.size} vs ${dstStat.size}, Hash mismatch)`)
        }
      } catch (err: any) {
        errors.push(`Failed verifying ${rel}: ${err.message}`)
      }
    }
  }

  private static async copyAndVerifyFile(
    srcFile: string,
    dstFile: string,
    category: string,
    migratedFiles: MigratedFileRecord[],
    errors: string[]
  ): Promise<void> {
    if (!existsSync(srcFile)) return

    await fs.mkdir(dirname(dstFile), { recursive: true })
    await fs.copyFile(srcFile, dstFile)

    try {
      const srcStat = await fs.stat(srcFile)
      const dstStat = await fs.stat(dstFile)

      const srcHash = await this.calculateSHA256(srcFile)
      const dstHash = await this.calculateSHA256(dstFile)

      const verified = srcStat.size === dstStat.size && srcHash === dstHash

      migratedFiles.push({
        relativeSrc: category.replace(/\\/g, '/'),
        absoluteSrc: srcFile,
        absoluteDst: dstFile,
        size: srcStat.size,
        sha256: dstHash,
        verified
      })

      if (!verified) {
        errors.push(`Integrity mismatch for ${category} (Size: ${srcStat.size} vs ${dstStat.size}, Hash mismatch)`)
      }
    } catch (err: any) {
      errors.push(`Failed verifying ${category}: ${err.message}`)
    }
  }

  private static async verifySQLiteIntegrity(dbPath: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const db = new Database(dbPath, { fileMustExist: true })
      const row = db.prepare('PRAGMA integrity_check').get() as any
      db.close()
      if (row && row.integrity_check === 'ok') {
        return { ok: true }
      } else {
        return { ok: false, error: row ? JSON.stringify(row) : 'PRAGMA integrity_check returned non-ok result' }
      }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  }

  private static async calculateSHA256(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath)
    return createHash('sha256').update(content).digest('hex')
  }

  private static async getAllFilesRecursively(dir: string): Promise<string[]> {
    const files: string[] = []
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const res = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await this.getAllFilesRecursively(res)))
      } else {
        files.push(res)
      }
    }
    return files
  }

  private static async generateValidationReport(
    reportPath: string,
    oldPath: string,
    newPath: string,
    status: 'success' | 'failed',
    migratedFiles: MigratedFileRecord[],
    sqliteIntegrity: string,
    errors: string[]
  ): Promise<void> {
    const nowStr = new Date().toISOString()
    let markdown = `# Migration Validation Report — Phase 1 Persistent User Data

Este reporte documenta y valida el proceso de migración local del perfil de usuario y engramas cognitivos de la versión previa de la plataforma.

---

## 1. Detalles Generales
*   **Fecha de Ejecución:** ${nowStr}
*   **Ruta de Origen (Anterior):** \`${oldPath}\`
*   **Ruta de Destino (Nueva):** \`${newPath}\`
*   **Estado General:** ${status === 'success' ? '🟢 **EXITOSO (SUCCESS)**' : '🔴 **CON ERRORES (FAILED)**'}
*   **Versión del Migrador:** \`${this.MIGRATION_VERSION}\`
*   **Validación de Base de Datos SQLite (PRAGMA integrity_check):** \`${sqliteIntegrity}\`
*   **Total de Archivos Migrados:** \`${migratedFiles.length}\`

---

## 2. Inventario de Archivos y Firmas de Integridad (SHA-256)

A continuación se detalla la lista de todos los archivos copiados, verificados bit-a-bit con firmas criptográficas de redundancia:

| Categoría / Archivo | Tamaño (bytes) | Hash SHA-256 Destino | Verificación |
| :--- | :--- | :--- | :--- |
`

    for (const file of migratedFiles) {
      const sizeStr = file.size.toLocaleString()
      const verificationStr = file.verified ? '🟢 OK' : '🔴 Mismatch'
      markdown += `| \`${file.relativeSrc}\` | \`${sizeStr}\` | \`${file.sha256}\` | ${verificationStr} |\n`
    }

    if (errors.length > 0) {
      markdown += `
---

## 3. Incidentes y Errores Detectados

Se han registrado los siguientes incidentes durante el proceso de migración:
`
      for (const err of errors) {
        markdown += `*   🔴 **Error:** ${err}\n`
      }
    } else {
      markdown += `
---

## 3. Conclusión de Auditoría
> [!NOTE]
> **Estado de Baseline Seguro:**  
> Todos los archivos de engramas semánticos, recuerdos episódicos, configuraciones y llaves simétricas locales han sido migrados exitosamente a la nueva estructura de **ArgOS Platform 3.2** (\`%APPDATA%\\\\Roaming\\\\argos\`). La firma de integridad coincide al 100% y la base de datos sqlite está libre de corrupción. La migración local ha concluido con éxito.
`
    }

    await fs.writeFile(reportPath, markdown, 'utf-8')
  }
}
