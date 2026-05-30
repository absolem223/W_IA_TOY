import { app, session, globalShortcut, ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import dotenv from 'dotenv'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { startProxyServer, stopProxyServer } from './proxy'
import { ProviderDiagnostics } from './providerDiagnostics'
import { openDevtoolsWindow } from './devtools'
import { MemoryManager } from './memory/MemoryManager'
import { VoiceManager } from './voice/VoiceManager'
import { CredentialVault } from './security/CredentialVault'
import { OAuthSessionManager } from './oauth/OAuthSessionManager'
import { RetrievalOrchestrator } from './retrieval/RetrievalOrchestrator'
import { globalJobQueue } from './jobs/JobQueue'
import { globalMediaStorage } from './multimedia/MediaStorage'
import { youtubeExecutor } from './multimedia/youtubePipeline'
import { initLogger, createLogger, flushLogs } from './logger'
import { parseCommand, dispatchAction } from './actions/registry'
import type { ActionContext } from './actions/registry'
import './actions/commands' // Side-effect: registers all built-in commands
import { showBootBanner } from './bootBanner'

import { createToolRegistry } from './tools/ToolRegistry'
import { registerMemoryTools } from './tools/memoryTools'
import { registerGoogleTools } from './tools/googleTools'
import { registerRetrievalTools } from './tools/retrievalTools'
import { registerMultimediaTools } from './tools/multimediaTools'
import { registerKnowledgeTools } from './tools/knowledgeTools'

import { LLMManager } from './services/llm/LLMManager'
import { LMStudioProvider } from './services/llm/providers/LMStudioProvider'
import { OpenRouterProvider } from './services/llm/providers/OpenRouterProvider'
import { LocalFallbackProvider } from './services/llm/providers/LocalFallbackProvider'
import { AgentEventStore } from './agent/AgentEventStore'
import { AgentExecutor } from './agent/AgentExecutor'

// ─── LOGGER INITIALIZATION ───────────────────────────────────
const userDataPath = app.getPath('userData')

// ── Boot Banner ── shown immediately at process start, before any subsystem
showBootBanner(userDataPath)

initLogger(userDataPath, 'info')

const appLog = createLogger('app')
const proxyLog = createLogger('proxy')
const memLog = createLogger('memory')
const voiceLog = createLogger('voice')

appLog.info('Node/Electron runtime started successfully.')

// ─── SINGLE INSTANCE PROTECTION ──────────────────────────────
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  appLog.warn('Another instance of Argos is already running. Exiting.')
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  appLog.info('Second instance detected. Focusing existing window.')
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    const win = windows[0]
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
})

// ─── CRASH HANDLERS ──────────────────────────────────────────
process.on('uncaughtException', (err) => {
  appLog.error('uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  appLog.error('unhandledRejection:', reason)
})

// ─── BOOT SEQUENCE ───────────────────────────────────────────
appLog.info('Registering app.whenReady()...')

// Module-level references for shutdown access.
let memoryManager: MemoryManager | null = null
let voiceManager: VoiceManager | null = null
let isShuttingDown = false

app.whenReady().then(async () => {
  appLog.info('app.whenReady() triggered.')
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.argos.widget')
  }

  try {
    appLog.info('Loading environment variables...')
    const envPath = app.isPackaged
      ? join(process.resourcesPath, '.env')
      : join(__dirname, '../../.env')

    appLog.info('Loading .env from:', envPath)
    const envResult = dotenv.config({ path: envPath })

    if (envResult.error) {
      appLog.error('.env load failed:', envResult.error)
    } else {
      appLog.info('.env loaded successfully.')
    }

    const API_KEY = process.env.API_KEY
    appLog.info('API_KEY present:', !!API_KEY)
    
    // Dump environment variables for debugging
    const envKeys = Object.keys(process.env).filter(k => 
      k.startsWith('DEV_') || k.startsWith('OPENROUTER_') || k.startsWith('GOOGLE_')
    )
    appLog.info('[BOOT_ENV] Loaded target keys:', envKeys.join(', '))
    
    if (process.env.DEV_FORCE_TOOL === undefined) {
      appLog.warn('\x1b[31m[MISSING_ENV] DEV_FORCE_TOOL not found in loaded .env\x1b[0m')
    } else {
      appLog.info('[BOOT_ENV] process.env.DEV_FORCE_TOOL =', process.env.DEV_FORCE_TOOL)
    }

    const envDiagnostics = new ProviderDiagnostics(appLog.logInfo, appLog.logError)
    const envWarnings = envDiagnostics.validateEnvironment()
    if (envWarnings.length > 0) {
      envWarnings.forEach(warning => {
        appLog.warn('[ENV_VALIDATION]', warning.providerId ?? 'runtime', warning.message)
      })
    }

    // ── Local AI Proxy ──
    appLog.info('Starting local AI proxy...')
    startProxyServer(proxyLog.logInfo, proxyLog.logError)

    // ── Media Permissions ──
    appLog.info('Setting up media permissions...')
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      // Allow media and audio capture for Web Speech API
      callback(true)
    })
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
      return true
    })
    appLog.info('Media permissions configured.')

    // ── Memory System ──
    appLog.info('Initializing memory system...')
    memoryManager = new MemoryManager(userDataPath, memLog.logInfo, memLog.logError)
    await memoryManager.initialize()

    // ── Voice System ──
    appLog.info('Initializing voice system...')
    voiceManager = new VoiceManager(userDataPath, voiceLog)
    await voiceManager.initialize()
    if (process.env.OPENAI_API_KEY) {
      try {
        const { OpenAIVoiceProvider } = await import('./voice/providers/openai')
        voiceManager.registerProvider(new OpenAIVoiceProvider())
      } catch (err: any) {
        voiceLog.error('Failed to register OpenAIVoiceProvider:', err)
      }
    }

    // ── OAuth & Security ──
    appLog.info('Initializing Credential Vault and OAuth...')
    const credentialVault = new CredentialVault(userDataPath, appLog.logInfo)
    await credentialVault.initialize()
    const oauthManager = new OAuthSessionManager(
      credentialVault, 
      appLog.logInfo, 
      (channel: string, ...args: any[]) => {
        BrowserWindow.getAllWindows().forEach(w => {
          if (!w.isDestroyed()) w.webContents.send(channel, ...args)
        })
      }
    )
    await oauthManager.loadSessions()

    // ── Retrieval Layer ──
    appLog.info('Initializing Retrieval Orchestrator...')
    const retrievalOrchestrator = new RetrievalOrchestrator(memoryManager, oauthManager)

    // ── Multimedia Pipeline ──
    appLog.info('Initializing Media Storage and Job Queue...')
    await globalMediaStorage.initialize()
    await globalMediaStorage.clearOrphans() // Cleanup old temp files
    globalJobQueue.registerExecutor('youtube', youtubeExecutor)

    // ── LLM System ──
    appLog.info('Initializing LLM system...')
    const llmLog = createLogger('llm')
    const llmManager = new LLMManager(userDataPath, llmLog.logInfo, llmLog.logError)
    llmManager.registerProvider(new LMStudioProvider())
    llmManager.registerProvider(new OpenRouterProvider())
    llmManager.registerProvider(new LocalFallbackProvider())
    await llmManager.initialize()

    // ── Action Layer ──
    const actionCtx: ActionContext = {
      memoryManager,
      voiceManager,
      llmManager,
      logger: appLog,
      callerPermission: 'debug', // Local user has full access
    }

    // IPC handler for slash commands from renderer
    ipcMain.handle('action:execute', async (_event, rawCommand: string) => {
      appLog.info(`[COMMAND_RECEIVED] Raw: ${rawCommand}`)
      const parsed = parseCommand(rawCommand)
      if (!parsed) {
        appLog.info(`[COMMAND_BYPASSED] Invalid command format: ${rawCommand}`)
        return { success: false, message: 'Invalid command format' }
      }
      appLog.info(`[COMMAND_PARSED] Name: ${parsed.name}, Args: ${parsed.args}`)
      appLog.info(`[COMMAND_DISPATCH] Dispatching action: ${parsed.name}`)
      const result = await dispatchAction(parsed.name, parsed.args, actionCtx)
      appLog.info(`[COMMAND_EXECUTED] Result for ${parsed.name}: ${JSON.stringify(result)}`)
      return result
    })

    // ── Tool Registry ──
    appLog.info('[BOOT] Initializing ToolRegistry')
    let toolRegistry;
    try {
      toolRegistry = createToolRegistry()
      appLog.info('[BOOT] Registering tools')
      registerMemoryTools(toolRegistry)
      registerGoogleTools(toolRegistry)
      registerRetrievalTools(toolRegistry)
      registerMultimediaTools(toolRegistry)
      registerKnowledgeTools(toolRegistry)
      appLog.info('[BOOT] ToolRegistry ready')
    } catch (err: any) {
      appLog.error(`[BOOT] ToolRegistry initialization failed: ${err.message}`)
      // Degraded runtime fallback
      appLog.warn('[BOOT] Entering degraded mode (no tools).')
      toolRegistry = createToolRegistry() // Empty registry
    }



    // ── Agent Event Store & Executor ──
    appLog.info('Initializing Agent Event Store & Executor...')
    const eventStore = new AgentEventStore(userDataPath)
    const agentExecutor = new AgentExecutor(
      userDataPath,
      llmManager,
      toolRegistry,
      eventStore,
      memoryManager,
      voiceManager,
      oauthManager,
      retrievalOrchestrator
    )

    // ── IPC Handlers ──
    appLog.info('Registering IPC handlers...')
    registerIpcHandlers(
      appLog.logInfo, 
      appLog.logError, 
      memoryManager, 
      voiceManager, 
      oauthManager, 
      retrievalOrchestrator, 
      toolRegistry,
      llmManager,
      agentExecutor
    )
    appLog.info('IPC handlers registered successfully.')

    // ── Window Creation ──
    appLog.info('Creating window...')
    const win = createWindow(appLog.logInfo, appLog.logError, voiceManager)
    appLog.info('createWindow function completed.')

    // Check and recover session if app crashed previously
    agentExecutor.checkAndRecoverSession().catch(err => {
      appLog.error('[BOOT] Failed during agent session check:', err)
    })

    // Emergency recovery shortcut — fixes ghost window where
    // setFocusable(false) persists after crash or IPC failure.
    globalShortcut.register('CommandOrControl+Shift+F12', () => {
      appLog.info('[RECOVERY] Global shortcut triggered — forcing window recovery.')
      if (win && !win.isDestroyed()) {
        win.setFocusable(true)
        win.setAlwaysOnTop(true, 'floating')
        win.center()
        win.show()
        win.focus()
      }
    })
    appLog.info('Recovery shortcut (Ctrl+Shift+F12) registered.')

    globalShortcut.register('CommandOrControl+Shift+D', () => {
      appLog.info('[DEVTOOLS] Global shortcut triggered — opening Cognitive DevTools.')
      openDevtoolsWindow(appLog.logInfo, appLog.logError)
    })
    appLog.info('DevTools shortcut (Ctrl+Shift+D) registered.')

  } catch (err) {
    appLog.error('FATAL ERROR DURING whenReady BOOT:', err)
  }
}).catch(err => {
  appLog.error('FATAL: app.whenReady rejected:', err)
})

// ─── SHUTDOWN — PROPER ASYNC PATTERN ─────────────────────────
// Electron doesn't await async before-quit handlers.
// We prevent the default quit, do cleanup, then re-quit.
app.on('before-quit', (e) => {
  if (isShuttingDown) return // Second pass: let it quit

  e.preventDefault()
  isShuttingDown = true
  appLog.info('before-quit: starting async cleanup...')

  const cleanup = async () => {
    try {
      globalShortcut.unregisterAll()
      stopProxyServer()
      if (voiceManager) {
        await voiceManager.shutdown()
      }
      if (memoryManager) {
        await memoryManager.shutdown()
      }
      flushLogs()
      appLog.info('Cleanup complete. Quitting.')
    } catch (err) {
      appLog.error('Error during shutdown cleanup:', err)
    } finally {
      app.quit()
    }
  }

  cleanup()
})

app.on('window-all-closed', () => {
  appLog.info('All windows closed, quitting app.')
  app.quit()
})
