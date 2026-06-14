import { ipcMain, BrowserWindow, app } from 'electron'
import { exec } from 'child_process'
import type { ChatMessage } from '../shared/types'
import { transcribeAudioOffline } from './offlineTranscription'
import { extractIdentity, extractAssistantMutation } from './memory/identityLayer'
import { buildRuntimeIntrospectionContext } from './runtimeIntrospection'
import { PromptLayerOrchestrator } from './promptLayerOrchestrator'
import { ContextObservability } from './contextObservability'
import { GenericPhraseReducer } from './genericPhraseReducer'
import { getRuntimeStatus } from './proxy'
import { openDevtoolsWindow } from './devtools'
import type { ToolRegistry } from './tools/ToolRegistry'
import type { SaveExplicitPayload, ProfileUpdatePayload, MigrationPayload } from './memory/types'
import type { CapabilityContext } from './tools/types'
import { globalAgentRuntime } from './agent/AgentState'
import { globalKnowledgeStore } from './knowledge/KnowledgeStore'
import type { OAuthSessionManager } from './oauth/OAuthSessionManager'
import type { RetrievalOrchestrator } from './retrieval/RetrievalOrchestrator'
import type { LLMManager } from './services/llm/LLMManager'
import type { AgentExecutor } from './agent/AgentExecutor'
import type { MemoryManager } from './memory/MemoryManager'
import type { VoiceManager } from './voice/VoiceManager'
import { buildCompactSelfAwarenessPrompt } from '../shared/selfAwareness'
import { VERSION, BUILD_DATE, COMMIT_HASH } from '../shared/versionInfo'

export type ProxyStatus = 'connecting' | 'connected' | 'unavailable'

// Orchestration singletons
const promptOrchestrator = new PromptLayerOrchestrator(6000);
const contextObservability = new ContextObservability();
const phraseReducer = new GenericPhraseReducer();

const CONTEXT_LIMITS = {
  memoryPreambleChars: 400,
  messageHistoryTurns: 8,
  runtimeContextChars: 200,
  systemIdentityChars: 300,
} as const

function truncateContext(value: string, maxChars: number): string {
  if (!value || value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
}

function limitMessageHistory(messages: ChatMessage[], maxTurns: number): ChatMessage[] {
  return messages.slice(-maxTurns)
}

function broadcast(channel: string, ...args: any[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, ...args)
    } catch {
      // Ignorar ventanas que ya no existen.
    }
  }
}

export function registerIpcHandlers(
  logInfo: (...args: any[]) => void = console.log,
  logError: (...args: any[]) => void = console.error,
  memoryManager?: MemoryManager,
  voiceManager?: VoiceManager | null,
  oauthManager?: OAuthSessionManager,
  retrievalOrchestrator?: RetrievalOrchestrator,
  toolRegistry?: ToolRegistry,
  llmManager?: LLMManager,
  agentExecutor?: AgentExecutor,
): void {
  ipcMain.handle('app:get-version-info', () => {
    return {
      version: VERSION,
      buildDate: BUILD_DATE,
      commitHash: COMMIT_HASH,
      mode: app.isPackaged ? 'PROD' : 'DEV',
      executablePath: app.getPath('exe'),
    }
  })

  ipcMain.handle('voice:transcribe', async (_event, audioBuffer: ArrayBuffer, mimeType: string) => {
    return transcribeAudioOffline(audioBuffer, mimeType, logInfo, logError)
  })

  // Analyze transcribed text with memory/initial_prompt context and forward as chat:send
  ipcMain.handle('voice:analyze-and-send', async (event, text: string) => {
    try {
      // Build messages with optional memory preamble
      const memoryResult = memoryManager?.getMemoryContext(text)
      const memoryCtx = truncateContext(memoryResult?.preamble || '', CONTEXT_LIMITS.memoryPreambleChars)
      const messages: ChatMessage[] = []
      if (memoryCtx) {
        messages.push({ role: 'system', content: memoryCtx } as any)
      }
      messages.push({ role: 'user', content: text } as ChatMessage)

      // Generate a lightweight requestId for tracking
      const requestId = Date.now()

      // Forward to standard chat pipeline (reuse existing handler)
      // Use the same event.sender so replies/streaming reach the caller
      await handleChatSend(event as any, messages, requestId)
      return { success: true }
    } catch (err: any) {
      logError('[IPC] voice:analyze-and-send failed:', err?.message || err)
      return { success: false, error: err?.message || String(err) }
    }
  })

  ipcMain.handle('dev:get-knowledge-graph', async () => {
    try {
      return globalKnowledgeStore.getFullGraph()
    } catch (e: any) {
      logError(`[IPC] Error getting knowledge graph: ${e.message}`)
      return { nodes: [], edges: [] }
    }
  })

  ipcMain.handle('dev:get-knowledge-metrics', async () => {
    try {
      return globalKnowledgeStore.getMetrics()
    } catch (e: any) {
      return {}
    }
  })

  // LLM Config IPC channels
  ipcMain.handle('llm:get-status', () => {
    return llmManager?.getStatus()
  })

    // Start LMStudio executable (invoked from renderer modal)
    ipcMain.handle('llm:start-lmstudio', async () => {
      const exe = process.env.LMSTUDIO_EXE_PATH
      if (!exe) return { success: false, error: 'LMSTUDIO_EXE_PATH not configured' }
      try {
        exec(`"${exe}"`, { windowsHide: true }, (err) => {
          if (err) console.error('[LLM] Failed to start LMStudio:', err)
        })
        return { success: true }
      } catch (e: any) {
        return { success: false, error: e?.message || String(e) }
      }
    })

    ipcMain.handle('llm:bios-selected', async (_event, modelId: string) => {
      try {
        if (llmManager) {
          await llmManager.updateConfig({ modelId })
          return { success: true }
        }
        return { success: false, error: 'LLMManager not available' }
      } catch (e: any) {
        return { success: false, error: e?.message || String(e) }
      }
    })

  ipcMain.handle('llm:get-settings', () => {
    return llmManager?.getSettings()
  })

  ipcMain.handle('llm:update-config', async (_event, settings: any) => {
    return llmManager?.updateConfig(settings)
  })

  // Recovery Control IPC channels
  ipcMain.handle('agent:recovery-resolve', (_event, payload: { approved: boolean }) => {
    if (agentExecutor) {
      agentExecutor.resolveRecovery(payload.approved)
      return { success: true }
    }
    return { success: false, error: 'AgentExecutor not initialized' }
  })

  ipcMain.handle('agent:get-session', () => {
    return agentExecutor?.getCurrentSession()
  })

  // Full runtime diagnostics — feeds the cognitive DevTools
  ipcMain.handle('agent:get-diagnostics', () => {
    const agentDiag = agentExecutor?.getDiagnostics() ?? null
    const llmStatus = llmManager?.getStatus() ?? null
    return {
      agent: agentDiag,
      llm: llmStatus ? {
        providerId: llmStatus.providerId,
        modelId: llmStatus.modelId,
        activeCapabilities: llmStatus.activeCapabilities,
      } : null,
      runtimePhase: globalAgentRuntime.getState().executionPhase,
      timestamp: Date.now(),
    }
  })

  ipcMain.on('agent:tool-approval-responded', (_event, payload: { approved: boolean }) => {
    if (agentExecutor) {
      agentExecutor.resolveToolApproval(payload.approved)
    }
  })

  async function handleChatSend(event: any, messages: ChatMessage[], requestId: number) {
    if (!agentExecutor) {
      logError('[IPC] AgentExecutor is not available')
      event.sender.send('chat:error', requestId, 'AgentExecutor is not available')
      event.sender.send('chat:done', requestId)
      return
    }

    try {
      // Handle simple slash commands before orchestration
      const lastUser = messages[messages.length - 1]
      if (lastUser && lastUser.role === 'user' && typeof lastUser.content === 'string') {
        const txt = lastUser.content.trim()
        if (txt.toLowerCase() === '/version') {
          const exePath = app.getPath('exe')
          const modeStr = app.isPackaged ? 'PROD' : 'DEV'
          const reply = [
            `ArgOS Version Information`,
            ``,
            `Version: ${VERSION}`,
            `Build: ${BUILD_DATE}`,
            `Commit: ${COMMIT_HASH || 'N/A'}`,
            `Mode: ${modeStr}`,
            ``,
            `Executable:`,
            `${exePath}`
          ].join('\n')
          event.sender.send('chat:system-message', reply)
          event.sender.send('chat:done', requestId)
          return
        }
        if (txt === '/bios') {
          // trigger BIOS modal in renderer
          broadcast('llm:show-bios')
          event.sender.send('chat:done', requestId)
          return
        }
        if (txt === '/modelo') {
          // show active model and available local models
          const llmStatus = llmManager?.getStatus()
          const lines: string[] = []
          if (llmStatus) {
            lines.push(`Modelo activo: ${llmStatus.modelId} (Provider: ${llmStatus.providerId})`)
          }
          // Attempt to list local models
          try {
            const lm = (llmManager as any)?.providers?.get('lmstudio')
            if (lm) {
              const res = await fetch((lm as any).baseUrl + '/models')
              if (res.ok) {
                const data = await res.json()
                const available = (data.data ?? []).map((m: any) => m.id)
                lines.push('Modelos locales:')
                available.forEach((m: string, i: number) => lines.push(`${i+1}. ${m}`))
              }
            }
          } catch {}

          const reply = lines.join('\n') || 'No hay información de modelo disponible.'
          event.sender.send('chat:system-message', reply)
          event.sender.send('chat:done', requestId)
          return
        }
      }
      // Build memory preamble + metadata from user's latest message
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
      const memoryResult = memoryManager?.getMemoryContext(lastUserMsg?.content || '')
      const memoryCtx = truncateContext(memoryResult?.preamble || '', CONTEXT_LIMITS.memoryPreambleChars)
      const usedMemories = memoryResult?.usedMemories || []
      const limitedMessages = limitMessageHistory(messages, CONTEXT_LIMITS.messageHistoryTurns)

      if (memoryCtx) {
        console.log(`[MEMORY_PREAMBLE] Injected into system prompt: ${memoryCtx.length} chars`)
      }

      // Retrieve the custom or default system prompt
      const rawSystemIdentity = memoryManager 
        ? await memoryManager.getSystemIdentity() 
        : buildCompactSelfAwarenessPrompt()
      const systemIdentity = truncateContext(rawSystemIdentity, CONTEXT_LIMITS.systemIdentityChars)
      const runtimeIntrospection = truncateContext(buildRuntimeIntrospectionContext({
        runtimeStatus: getRuntimeStatus(),
        memoryStatus: memoryManager?.getStatus() ?? { turnCount: 0, vaultCount: 0, profileKeys: 0 },
        cognitiveState: memoryManager?.getCognitiveState() ?? { activeTopic: null, contextPressure: 0 },
        memoryActivations: usedMemories.map((item: any) => ({ label: item.label, score: item.score, type: item.type })),
      }), CONTEXT_LIMITS.runtimeContextChars)

      // Orchestrate all prompt layers with pressure management
            const orchestrationResult = promptOrchestrator.orchestrate({
              systemIdentity,
        runtimeIntrospection,
        // Include explicit memory preamble so the orchestrator can inject it
        memoryPreamble: memoryCtx || undefined,
        assistantIdentity: memoryManager?.getProfile()?.assistant?.assistant_name ? `Tu nombre es ${memoryManager.getProfile()?.assistant?.assistant_name}.` : '',
        memories: usedMemories,
        messageHistory: limitedMessages,
        userInput: lastUserMsg?.content || '',
        activeTopic: memoryManager?.getCognitiveState()?.activeTopic || undefined,
        capabilities: llmManager?.getActiveCapabilities(),
      })

      console.log(`[ORCHESTRATION] Pressure: ${orchestrationResult.pressure.globalPressure}% | Layers: ${orchestrationResult.injectedLayers.size}`)
      console.log(`[ORCHESTRATION_METRICS] System tokens: ${orchestrationResult.observability.systemPromptTokens} | Message tokens: ${orchestrationResult.observability.messageHistoryTokens}`)

      if (orchestrationResult.pressure.warnings.length > 0) {
        console.warn(`[ORCHESTRATION_WARNINGS] ${orchestrationResult.pressure.warnings.join(' | ')}`)
      }

      const obsMetric = contextObservability.recordOrchestration(
        orchestrationResult,
        orchestrationResult.pressure,
        limitedMessages.reduce((sum, msg) => sum + msg.content.length, 0)
      )
      const health = contextObservability.getHealthSummary()
      if (!health.healthy) {
        console.warn(`[CONTEXT_HEALTH] Issues: ${health.issues.join(', ')}`)
      }
      broadcast('context:observability', obsMetric, health)
      broadcast('runtime:status', getRuntimeStatus())
      broadcast('runtime:prompt-preview', orchestrationResult.finalSystemPrompt.slice(0, 1200))

      // Memory Observability Metrics
      if (usedMemories.length > 0) {
        const turnCount = memoryManager?.getTurnCount() || 0
        console.log(`[MEMORY_METRICS] Req: ${requestId} | Session Turns: ${turnCount} | Injected: ${usedMemories.length} memories | Profile Hits: ${usedMemories.filter((m: any) => m.type === 'profile').length}`)
        broadcast('chat:memory-used', requestId, usedMemories)
      } else {
        console.log(`[MEMORY_METRICS] Req: ${requestId} | No memories injected (Stateless turn)`)
      }

      if (memoryManager) {
        const cogState = memoryManager.getCognitiveState()
        broadcast('chat:cognitive-state', cogState)
      }

      // Execute via AgentExecutor
      await agentExecutor.run(requestId, limitedMessages, orchestrationResult.finalSystemPrompt, event.sender)
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      event.sender.send('chat:error', requestId, message)
      event.sender.send('chat:done', requestId)
    }
  }

  ipcMain.on('chat:send', async (event, messages: ChatMessage[], requestId: number) => {
    console.log(`[CHAT_PIPELINE] MAIN received chat:send for request [${requestId}]`)
    broadcast('proxy:status', 'connecting')
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    // Track turns in working memory (non-blocking)
    if (memoryManager) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg) {
        memoryManager.appendTurn(lastMsg)

        // Vault autosave cada N turnos
        try {
          const autosaveInterval = Number(process.env.VAULT_AUTOSAVE_EVERY_N_TURNS || '10')
          const turnCount = memoryManager.getTurnCount()
          if (turnCount > 0 && turnCount % autosaveInterval === 0) {
            console.log(`[VAULT_AUTOSAVE] Triggered autosave at turn count: ${turnCount}`)
            const formattedChat = messages
              .map(m => `### ${m.role === 'user' ? 'Usuario' : 'Asistente'}\n\n${m.content}`)
              .join('\n\n')
            const title = `Conversación Auto-guardada — Turno ${turnCount}`
            const tags = ['autosave', 'conversacion']
            memoryManager.saveToVault(title, formattedChat, tags).catch(err => {
              console.error('[VAULT_AUTOSAVE] Save failed:', err)
            })
          }
        } catch (autosaveErr) {
          console.error('[VAULT_AUTOSAVE] Logic error:', autosaveErr)
        }
      }
    }

    if (agentExecutor && (agentExecutor.isWaitingForRecoveryApproval() || agentExecutor.isWaitingForToolApproval())) {
      console.log(`[IPC] chat:send [${requestId}] received during active approval/recovery. Initiating backpressure interruption.`)
      broadcast('agent:approval-interrupted', {
        requestId,
        objective: messages[messages.length - 1]?.content || ''
      })

      const interruptionHandler = async (_event: any, payload: {
        option: 'continue-pending' | 'cancel-pending' | 'overwrite-with-new'
      }) => {
        ipcMain.removeListener('agent:resolve-interruption', interruptionHandler)
        console.log(`[IPC] Interruption resolved with option: ${payload.option}`)

        if (payload.option === 'continue-pending') {
          event.sender.send('chat:error', requestId, 'Aprobación pendiente continuada. Mensaje nuevo descartado.')
          event.sender.send('chat:done', requestId)
        } else if (payload.option === 'cancel-pending') {
          if (agentExecutor.isWaitingForRecoveryApproval()) {
            agentExecutor.resolveRecovery(false)
          } else {
            agentExecutor.resolveToolApproval(false)
          }
          agentExecutor.cancelActiveRun()
          event.sender.send('chat:error', requestId, 'Acción pendiente cancelada.')
          event.sender.send('chat:done', requestId)
        } else if (payload.option === 'overwrite-with-new') {
          if (agentExecutor.isWaitingForRecoveryApproval()) {
            agentExecutor.resolveRecovery(false)
          } else {
            agentExecutor.resolveToolApproval(false)
          }
          agentExecutor.cancelActiveRun()
          await handleChatSend(event, messages, requestId)
        }
      }

      ipcMain.on('agent:resolve-interruption', interruptionHandler)
      return
    }

    await handleChatSend(event, messages, requestId)
  })

  // Cancelar el stream en curso
  ipcMain.on('chat:cancel', (_event, requestId: number) => {
    console.log(`[IPC] chat:cancel [${requestId}] received — aborting active run.`)
    if (agentExecutor) {
      agentExecutor.cancelActiveRun()
    }
  })

  ipcMain.handle('runtime:get-status', () => {
    return getRuntimeStatus()
  })

  // ── Widget Window Handlers ──────────────────────────────────────────────────
  //
  // Arquitectura de control: RENDERER es el único source of truth del estado
  // isOpen. El host Electron NUNCA inicia un toggle por su cuenta.
  //
  // Flujo unidireccional:
  //   Widget.tsx toggle() → resizeWindow() + setPanelState()
  //                              ↓                    ↓
  //                       widget:resize       widget:panel-state
  //                       (solo setSize)      (solo focusability)
  //
  // Dos handlers separados porque son responsabilidades independientes:
  //   widget:resize      → tamaño de ventana (layout concern)
  //   widget:panel-state → focusabilidad     (interaction concern)
  //
  // El botón DevTools (🛠️) en WidgetHeader abre una ventana SEPARADA via
  // devtools:open. El DebugOverlay (también 🛠️) es un panel inline del chat.
  // Son dos features distintas — la similitud de icono es cosmética.
  // ─────────────────────────────────────────────────────────────────────────

  // Resize the window when the chat panel opens/closes (layout concern only)
  ipcMain.on('widget:resize', (_event, height: number) => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      const [width] = win.getSize()
      win.setSize(width, height, true)
    }
  })

  ipcMain.on('devtools:open', () => {
    openDevtoolsWindow(logInfo, logError)
  })

  // Toggle window focusability when the panel opens/closes (interaction concern only).
  // Kept separate from widget:resize because size and focus state are independent
  // responsibilities that may diverge as the UI evolves.
  ipcMain.on('widget:panel-state', (_event, isOpen: boolean) => {
    const [win] = BrowserWindow.getAllWindows()
    if (!win) return

    if (isOpen) {
      console.log('[WINDOW] OPEN → restoring interaction')
      win.setIgnoreMouseEvents(false)
      win.setFocusable(true)
      win.show()
      win.focus()
    } else {
      console.log('[WINDOW] CLOSE → keeping header clickable')
      // No usamos setIgnoreMouseEvents(true) aquí porque al redimensionar 
      // la ventana a 60px (el alto del header), ya no bloquea el escritorio.
      // Si lo activamos, en muchos sistemas Windows la ventana se vuelve "fantasma" 
      // y no detecta el click para volver a abrirse.
      win.setIgnoreMouseEvents(false) 
      win.setFocusable(false)
    }

    win.setAlwaysOnTop(true, 'floating')
  })

  // Kill the application completely
  ipcMain.on('app:quit', () => {
    app.quit()
  })

  // ── Memory System IPC Handlers ──
  if (memoryManager) {
    memoryManager.setOnSync(() => {
      broadcast('memory:sync')
    })

    ipcMain.handle('memory:save-explicit', async (_event, payload: SaveExplicitPayload) => {
      return memoryManager.saveToVault(payload.title, payload.content, payload.tags)
    })

    ipcMain.handle('memory:delete-vault', async (_event, payload: { id: string }) => {
      return memoryManager.deleteFromVault(payload.id)
    })

    ipcMain.handle('memory:get-vault', async () => {
      return memoryManager.getVaultEntries()
    })

    ipcMain.handle('memory:get-profile', async () => {
      return memoryManager.getProfile()
    })

    ipcMain.handle('memory:update-profile', async (_event, payload: ProfileUpdatePayload) => {
      await memoryManager.updateProfile(payload.key, payload.value)
    })

    ipcMain.handle('memory:migrate-data', async (_event, payload: MigrationPayload) => {
      return memoryManager.migrate(payload.messages)
    })

    ipcMain.handle('memory:get-status', async () => {
      return memoryManager.getStatus()
    })

    ipcMain.handle('identity:get', async () => {
      return memoryManager.getSystemIdentity()
    })

    ipcMain.handle('identity:set', async (_event, content: string) => {
      await memoryManager.setSystemIdentity(content)
      return { success: true }
    })

    ipcMain.handle('identity:reset', async () => {
      const defaultVal = await memoryManager.resetSystemIdentity()
      return { success: true, defaultVal }
    })

    logInfo('[IPC] Memory handlers registered.')
  }
}
