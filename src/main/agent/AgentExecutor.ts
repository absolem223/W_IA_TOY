import { promises as fs } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import type { ChatMessage } from '../../shared/types'
import type { LLMManager } from '../services/llm/LLMManager'
import type { ToolRegistry } from '../tools/ToolRegistry'
import type { AgentEventStore } from './AgentEventStore'
import type { MemoryManager } from '../memory/MemoryManager'
import type { VoiceManager } from '../voice/VoiceManager'
import type { OAuthSessionManager } from '../oauth/OAuthSessionManager'
import type { RetrievalOrchestrator } from '../retrieval/RetrievalOrchestrator'
import type { CapabilityContext } from '../tools/types'
import { globalAgentRuntime } from './AgentState'

export interface AgentSession {
  sessionId: string
  correlationId: string
  objective: string
  phase: string
  messages: ChatMessage[]
  recursions: number
  activeToolCalls: Array<{
    index: number
    id: string
    name: string
    argsBuffer: string
    status: 'pending' | 'completed'
    result?: any
  }>
  timestamp: number
  failureCount?: number
  lastRecoveryAttempt?: number
  lastFailureReason?: string
  activeProviderId?: string
  activeModelId?: string
}

export class AgentExecutor {
  private sessionPath: string
  private currentSession: AgentSession | null = null
  private activeCancellation: AbortController | null = null
  private recoveryResolver: ((approved: boolean) => void) | null = null
  private toolApprovalResolver: ((approved: boolean) => void) | null = null
  private savePromise: Promise<void> = Promise.resolve()
  private safeMode: boolean = false
  private lastActivityAt: number = 0
  private loopStartedAt: number | null = null
  private firstTokenAt: number | null = null
  private stallDetected: boolean = false
  private stallWatchdog: ReturnType<typeof setTimeout> | null = null

  /** Expose internal state for DevTools and diagnostics. */
  getDiagnostics() {
    const now = Date.now()
    // Capture a local copy to avoid TOCTOU races where `this.currentSession` may be nulled
    const cs = this.currentSession
    return {
      isRunning: this.activeCancellation !== null,
      pendingApproval: this.recoveryResolver !== null || this.toolApprovalResolver !== null,
      pendingRecovery: this.recoveryResolver !== null,
      pendingToolApproval: this.toolApprovalResolver !== null,
      isSafeMode: this.safeMode,
      stallDetected: this.stallDetected,
      lastActivityAt: this.lastActivityAt,
      loopStartedAt: this.loopStartedAt,
      firstTokenAt: this.firstTokenAt,
      loopAgeMs: this.loopStartedAt ? now - this.loopStartedAt : null,
      timeSinceFirstTokenMs: this.firstTokenAt ? now - this.firstTokenAt : null,
      currentSession: cs ? {
        sessionId: cs.sessionId,
        objective: cs.objective?.substring(0, 80),
        recursions: cs.recursions,
        failureCount: cs.failureCount ?? 0,
        phase: cs.phase ?? 'unknown',
        activeToolCalls: cs.activeToolCalls.length,
      } : null,
    }
  }

  constructor(
    private userDataPath: string,
    private llmManager: LLMManager,
    private toolRegistry: ToolRegistry,
    private eventStore: AgentEventStore,
    private memoryManager?: MemoryManager,
    private voiceManager?: VoiceManager | null,
    private oauthManager?: OAuthSessionManager,
    private retrievalOrchestrator?: RetrievalOrchestrator
  ) {
    this.sessionPath = join(userDataPath, 'agent-session.json')
  }

  getCurrentSession(): AgentSession | null {
    return this.currentSession
  }

  isSafeMode(): boolean {
    return this.safeMode
  }

  isWaitingForRecoveryApproval(): boolean {
    return this.recoveryResolver !== null
  }

  isWaitingForToolApproval(): boolean {
    return this.toolApprovalResolver !== null
  }

  resolveToolApproval(approved: boolean) {
    if (this.toolApprovalResolver) {
      this.toolApprovalResolver(approved)
    }
  }

  enterSafeMode(): void {
    this.safeMode = true
    console.warn('[AGENT_SAFE_MODE] Runtime has entered SAFE MODE. Tools disabled, recovery suspended, execution restricted.')
    this.eventStore.log({
      sessionId: this.currentSession?.sessionId || 'system',
      correlationId: this.currentSession?.correlationId || 'system',
      event: 'SAFE_MODE_ENABLED',
      payload: { timestamp: Date.now() }
    }).catch(() => {})
  }

  private async archiveCorruptedSession(session: AgentSession, reason: string): Promise<void> {
    console.warn(`[AGENT_SAFE_MODE] Archiving corrupted session ${session.sessionId}. Reason: ${reason}`)
    
    session.failureCount = (session.failureCount || 0) + 1
    session.lastFailureReason = reason
    session.lastRecoveryAttempt = Date.now()
    session.activeProviderId = this.llmManager.getStatus().providerId
    session.activeModelId = this.llmManager.getStatus().modelId

    const bakPath = this.sessionPath + '.bak'
    try {
      await fs.writeFile(bakPath, JSON.stringify(session, null, 2), 'utf-8')
      console.log(`[AGENT_SAFE_MODE] Saved corrupted session backup to ${bakPath}`)
    } catch (err) {
      console.error(`[AGENT_SAFE_MODE] Failed to write backup session:`, err)
    }

    await this.eventStore.log({
      sessionId: session.sessionId,
      correlationId: session.correlationId,
      event: 'SESSION_CORRUPTED',
      payload: {
        reason,
        failureCount: session.failureCount,
        activeProviderId: session.activeProviderId,
        activeModelId: session.activeModelId
      }
    })

    this.enterSafeMode()
    await this.clearSession()
  }

  /**
   * Check for interrupted sessions on app boot.
   * If a session exists and is within the expiration window (30-60m),
   * trigger the recovery flow.
   */
  async checkAndRecoverSession(eventSender?: any): Promise<void> {
    if (this.safeMode) {
      console.log('[AGENT_SAFE_MODE] Recovery suspended while in Safe Mode.')
      return
    }
    try {
      const data = await fs.readFile(this.sessionPath, 'utf-8')
      const session = JSON.parse(data) as AgentSession

      // Check if it already exceeded recovery failures
      const failureCount = session.failureCount || 0
      if (failureCount >= 3) {
        console.warn(`[AGENT_RECOVERY] Session ${session.sessionId} has failed recovery ${failureCount} times. Triggering Safe Mode.`)
        await this.archiveCorruptedSession(session, `Repeated recovery failures (count: ${failureCount})`)
        return
      }

      if (session.recursions >= 5) {
        console.warn(`[AGENT_RECOVERY] Session ${session.sessionId} has recursion overflow (${session.recursions}). Triggering Safe Mode.`)
        await this.archiveCorruptedSession(session, `Recursion overflow (recursions: ${session.recursions})`)
        return
      }

      const expiry = this.llmManager.getSettings().recoveryExpiryMs
      const age = Date.now() - session.timestamp

      if (age > expiry) {
        console.log(`[AGENT_RECOVERY] Found session ${session.sessionId} but it was stale (${Math.round(age / 60000)}m old). Discarding.`)
        await this.clearSession()
        return
      }

      console.log(`[AGENT_RECOVERY] Found active session ${session.sessionId} (${Math.round(age / 60000)}m old). Restoring state.`)
      this.currentSession = session
      this.eventStore.log({
        sessionId: session.sessionId,
        correlationId: session.correlationId,
        event: 'SESSION_START',
        payload: { recovered: true, ageMs: age }
      })

      // If we crashed while a tool call was pending, we must check safety policies
      const pendingTools = session.activeToolCalls.filter(tc => tc.status === 'pending')
      if (pendingTools.length > 0) {
        console.log(`[AGENT_RECOVERY] Session was interrupted mid-tool execution. Validating execution policies.`)
        
        let needsUserApproval = false
        for (const tc of pendingTools) {
          const toolDef = this.toolRegistry.getToolDefinitions().find(t => t.function.name === tc.name)?.function
          const policy = toolDef?.executionPolicy || 'requires-confirmation'
          
          if (policy !== 'replayable') {
            needsUserApproval = true
            console.log(`[AGENT_RECOVERY] Tool '${tc.name}' is marked '${policy}'. User confirmation is REQUIRED.`)
          } else {
            console.log(`[AGENT_RECOVERY] Tool '${tc.name}' is marked 'replayable'. Auto-re-execution is safe.`)
          }
        }

        if (needsUserApproval) {
          this.broadcast('agent:recovery-required', {
            sessionId: session.sessionId,
            pendingTools: pendingTools.map(t => ({ name: t.name, args: t.argsBuffer }))
          })
          this.eventStore.log({
            sessionId: session.sessionId,
            correlationId: session.correlationId,
            event: 'RECOVERY_REQUESTED',
            payload: { pendingTools: pendingTools.map(t => t.name) }
          })
          
          // Wait for user approval via IPC handler — with 30s safety timeout
          globalAgentRuntime.setPhase('tool-wait')
          const approved = await new Promise<boolean>((resolve) => {
            this.recoveryResolver = resolve
            // Safety: auto-cancel recovery after 30s if no UI response
            setTimeout(() => {
              if (this.recoveryResolver) {
                console.warn('[AGENT_RECOVERY] Recovery approval timed out (30s). Auto-cancelling.')
                this.eventStore.log({
                  sessionId: session.sessionId,
                  correlationId: session.correlationId,
                  event: 'RECOVERY_TIMEOUT',
                  payload: { reason: 'No UI response after 30s' }
                }).catch(() => {})
                this.recoveryResolver = null
                resolve(false)
              }
            }, 30_000)
          })
          this.recoveryResolver = null

          this.eventStore.log({
            sessionId: session.sessionId,
            correlationId: session.correlationId,
            event: 'RECOVERY_RESOLVED',
            payload: { approved }
          })

          if (!approved) {
            console.log(`[AGENT_RECOVERY] User rejected session recovery. Clearing session.`)
            await this.clearSession()
            this.broadcast('agent:recovery-cancelled', { sessionId: session.sessionId })
            return
          }
        }
      }

      // Resume execution loop in the background
      console.log(`[AGENT_RECOVERY] Resuming agent execution loop...`)
      this.runRecovery(session, eventSender)
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error('[AGENT_RECOVERY] Failed to check for session recovery:', err)
      }
    }
  }

  resolveRecovery(approved: boolean) {
    if (this.recoveryResolver) {
      this.recoveryResolver(approved)
    }
  }

  cancelActiveRun(): void {
    if (this.activeCancellation) {
      this.activeCancellation.abort()
      this.activeCancellation = null
    }
    if (this.currentSession) {
      this.eventStore.log({
        sessionId: this.currentSession.sessionId,
        correlationId: this.currentSession.correlationId,
        event: 'SESSION_ERROR',
        failureReason: 'User cancelled execution'
      })
      this.clearSession().catch(err => console.error('[AGENT] Clear session failed:', err))
    }
  }

  /**
   * Run the agent executor loop for a new user prompt.
   */
  async run(
    requestId: number,
    messages: ChatMessage[],
    systemPrompt: string,
    eventSender: any
  ): Promise<void> {
    this.cancelActiveRun()

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const correlationId = `req-${requestId}-${Date.now()}`
    const loopTraceId = `trace-${requestId}-${Date.now()}`

    // Reset stall tracking
    this.loopStartedAt = Date.now()
    this.lastActivityAt = Date.now()
    this.firstTokenAt = null
    this.stallDetected = false

    // Stall watchdog: alert if no first token arrives within 20s
    this._clearStallWatchdog()
    this.stallWatchdog = setTimeout(() => {
      if (!this.firstTokenAt) {
        this.stallDetected = true
        const diag = this.getDiagnostics()
        console.error(`[AGENT_STALL] ⚠️  No token received after 20s! loopTraceId=${loopTraceId}`, JSON.stringify(diag))
        this.eventStore.log({
          sessionId,
          correlationId,
          event: 'LOOP_STALL_DETECTED',
          payload: { loopTraceId, diagnostics: diag }
        }).catch(() => {})
      }
    }, 20_000)

    this.currentSession = {
      sessionId,
      correlationId,
      objective: messages[messages.length - 1]?.content || '',
      phase: 'planning',
      messages: [...messages],
      recursions: 0,
      activeToolCalls: [],
      timestamp: Date.now(),
      failureCount: 0,
      lastRecoveryAttempt: undefined,
      lastFailureReason: undefined,
      activeProviderId: this.llmManager.getStatus().providerId,
      activeModelId: this.llmManager.getStatus().modelId
    }

    await this.saveSession()
    
    await this.eventStore.log({
      sessionId,
      correlationId,
      event: 'SESSION_START',
      // Defensive: currentSession may be null in some races, avoid reading property of null
      payload: { objective: this.currentSession?.objective ?? '', loopTraceId }
    })

    console.log(`[AGENT_TRACE] LOOP_START loopTraceId=${loopTraceId} messages=${messages.length} systemPromptChars=${systemPrompt?.length ?? 0}`)

    this.activeCancellation = new AbortController()
    const { signal } = this.activeCancellation

    try {
      await this.executionLoop(this.currentSession, systemPrompt, eventSender, signal, requestId, false, loopTraceId)
    } catch (err: any) {
      if (signal.aborted) {
        console.log(`[AGENT_TRACE] LOOP_ABORTED loopTraceId=${loopTraceId}`)
        return
      }
      console.error(`[AGENT_TRACE] LOOP_ERROR loopTraceId=${loopTraceId}:`, err.message, err.stack)
      this.logSessionError(err.message || String(err))
      eventSender.send('chat:error', requestId, err.message || 'Error de ejecución del agente')
    } finally {
      this._clearStallWatchdog()
      this.activeCancellation = null
      this.loopStartedAt = null
      // CRITICAL: always reset runtime phase to idle so DevTools doesn't get stuck
      globalAgentRuntime.setPhase('idle')
      console.log(`[AGENT_TRACE] LOOP_FINALIZED loopTraceId=${loopTraceId}`)
      eventSender.send('chat:done', requestId)
    }
  }

  private async runRecovery(session: AgentSession, eventSender?: any): Promise<void> {
    this.activeCancellation = new AbortController()
    const { signal } = this.activeCancellation
    const loopTraceId = `recovery-${Date.now()}`

    this.loopStartedAt = Date.now()
    this.firstTokenAt = null
    this.stallDetected = false

    // Recovering the IPC sender target (or broad broadcasting)
    const sender = eventSender || {
      send: (channel: string, ...args: any[]) => this.broadcast(channel, ...args)
    }

    try {
      console.log(`[AGENT_TRACE] RECOVERY_LOOP_START loopTraceId=${loopTraceId} session=${session.sessionId}`)
      await this.executionLoop(session, '', sender, signal, 0, true, loopTraceId)
    } catch (err: any) {
      if (signal.aborted) return
      console.error(`[AGENT_TRACE] RECOVERY_LOOP_ERROR loopTraceId=${loopTraceId}:`, err.message, err.stack)
      this.logSessionError(err.message || String(err))
      sender.send('chat:error', 0, `Sesión recuperada fallida: ${err.message}`)
      
      const currentFailures = (session.failureCount || 0) + 1
      if (currentFailures >= 3) {
        await this.archiveCorruptedSession(session, `Recovery loop execution crashed: ${err.message}`)
      } else {
        session.failureCount = currentFailures
        session.lastFailureReason = err.message
        session.lastRecoveryAttempt = Date.now()
        session.activeProviderId = this.llmManager.getStatus().providerId
        session.activeModelId = this.llmManager.getStatus().modelId
        await this.saveSession()
      }
    } finally {
      this._clearStallWatchdog()
      this.activeCancellation = null
      this.loopStartedAt = null
      // CRITICAL: always reset runtime phase to idle
      globalAgentRuntime.setPhase('idle')
      console.log(`[AGENT_TRACE] RECOVERY_LOOP_FINALIZED loopTraceId=${loopTraceId}`)
      sender.send('chat:done', 0)
    }
  }

  private async executionLoop(
    session: AgentSession | null,
    systemPrompt: string,
    eventSender: any,
    signal: AbortSignal,
    requestId: number,
    isRecovered = false,
    loopTraceId = 'unknown'
  ): Promise<void> {
    const MAX_RECURSIONS = 5
    const TIMEOUT_BUDGET_MS = 45000
    const startTimeLoop = Date.now()

    // Defensive: guard against a null session (could happen during recovery races)
    if (!session) {
      console.error('[AGENT] executionLoop invoked with null session — aborting loop', { loopTraceId, requestId })
      return
    }

    globalAgentRuntime.reset(session.objective)
    globalAgentRuntime.setPhase('executing')
    this.updateSessionPhase(session, 'executing')

    const tools = this.toolRegistry.getToolDefinitions()
    const capabilities = this.llmManager.getActiveCapabilities()

    let wasAborted = false
    let sentenceBuffer = ''
    const voiceReqId = `voice-${requestId}`

    // If we are recovering, check if we need to resolve tool calls first
    if (isRecovered) {
      const pendingTools = session.activeToolCalls.filter(tc => tc.status === 'pending')
      if (pendingTools.length > 0) {
        console.log(`[AGENT_RECOVERY] Execution loop resolving pending tool calls...`)
        await this.executePendingTools(session, pendingTools, eventSender, signal, true)
        
        // Push tool responses to current session messages
        for (const tc of session.activeToolCalls) {
          session.messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(tc.result)
          } as any)
        }
        session.activeToolCalls = []
        session.recursions++
        await this.saveSession()
      }
    }

    while (session.recursions < MAX_RECURSIONS) {
      if (signal.aborted) return

      if (Date.now() - startTimeLoop > TIMEOUT_BUDGET_MS) {
        console.warn(`[AGENT] Timeout budget (${TIMEOUT_BUDGET_MS}ms) exceeded.`)
        this.logSessionError('Timeout budget exceeded')
        break
      }

      this.updateSessionPhase(session, 'executing')
      globalAgentRuntime.incrementRecursion()

      let responseBuffer = ''
      sentenceBuffer = ''

      // Capability Match: Negotiating tools usage
      const activeTools = (capabilities.tools && !this.safeMode) ? tools : []

      const llmRequestStart = Date.now()
      console.log(`[AGENT_TRACE] LLM_REQUEST_DISPATCHED loopTraceId=${loopTraceId} provider=${this.llmManager.getStatus().providerId} model=${this.llmManager.getStatus().modelId} tools=${activeTools.length} sysPromptChars=${systemPrompt?.length ?? 0} msgCount=${session.messages.length}`)

      await this.eventStore.log({
        sessionId: session.sessionId,
        correlationId: session.correlationId,
        event: 'LLM_START',
        provider: this.llmManager.getStatus().providerId,
        model: this.llmManager.getStatus().modelId
      })

      const completionResult = await this.llmManager.streamCompletion(
        session.messages,
        {
          systemPrompt: systemPrompt || undefined,
          tools: activeTools,
          toolChoice: capabilities.tools ? 'auto' : undefined,
          signal,
          correlationId: session.correlationId
        },
        (chunk) => {
          if (this.safeMode) {
            console.log(`[AGENT_SAFE_MODE_DEBUG] Received completion chunk: ${JSON.stringify(chunk)}`)
          }
          if (chunk.content) {
            // Track first-token latency
            if (!this.firstTokenAt) {
              this.firstTokenAt = Date.now()
              this.lastActivityAt = this.firstTokenAt
              const ttft = this.loopStartedAt ? this.firstTokenAt - this.loopStartedAt : -1
              console.log(`[AGENT_TRACE] LLM_FIRST_TOKEN loopTraceId=${loopTraceId} ttftMs=${ttft}`)
              this.eventStore.log({
                sessionId: session.sessionId,
                correlationId: session.correlationId,
                event: 'LLM_FIRST_TOKEN',
                payload: { loopTraceId, ttftMs: ttft }
              }).catch(() => {})
            }
            this.lastActivityAt = Date.now()
            responseBuffer += chunk.content
            sentenceBuffer += chunk.content
            
            eventSender.send('chat:token', requestId, chunk.content)

            // Dynamic event chunks (avoid clogging log with every single token, write in groups or metadata only)
            // Incremental TTS synthesis
            if (this.voiceManager && /[.?!]\s+$/.test(sentenceBuffer)) {
              const sentence = sentenceBuffer.trim()
              if (sentence.length > 3) {
                if (this.voiceManager.getStatus().enabled && !this.voiceManager.getStatus().muted) {
                  this.voiceManager.speak(sentence, voiceReqId, requestId).catch(() => {})
                }
                sentenceBuffer = ''
              }
            }
          }

          if (chunk.toolCalls) {
            for (const tc of chunk.toolCalls) {
              let existing = session.activeToolCalls.find(x => x.index === tc.index)
              if (!existing) {
                existing = { index: tc.index, id: tc.id || '', name: tc.function?.name || '', argsBuffer: '', status: 'pending' }
                session.activeToolCalls.push(existing)
              }
              if (tc.function?.arguments) {
                existing.argsBuffer += tc.function.arguments
              }
            }
          }
        }
      )

      if (signal.aborted) return

      const llmLatency = Date.now() - llmRequestStart
      console.log(`[AGENT_TRACE] LLM_STREAM_COMPLETE loopTraceId=${loopTraceId} latencyMs=${llmLatency} responseChars=${responseBuffer.length} toolCalls=${session.activeToolCalls.length}`)

      await this.eventStore.log({
        sessionId: session.sessionId,
        correlationId: session.correlationId,
        event: 'LLM_COMPLETE',
        provider: completionResult.providerId,
        model: completionResult.model,
        latency: completionResult.latencyMs,
        tokenUsage: completionResult.tokenUsageEstimate
      })

      // If tools were invoked
      if (session.activeToolCalls.length > 0) {
        this.updateSessionPhase(session, 'tool-wait')
        globalAgentRuntime.addToolCallCount(session.activeToolCalls.length)
        globalAgentRuntime.setPhase('tool-wait')

        eventSender.send('agent:loop', {
          recursion: session.recursions,
          tools: session.activeToolCalls,
          state: globalAgentRuntime.getState()
        })

        // Save session state to disk before executing tools
        await this.saveSession()

        // Push assistant function call declaration to messages list
        session.messages.push({
          role: 'assistant',
          content: null,
          tool_calls: session.activeToolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.argsBuffer }
          }))
        } as any)

        // Execute tool calls
        await this.executePendingTools(session, session.activeToolCalls, eventSender, signal)

        // Map results back to chat completions history
        for (const tc of session.activeToolCalls) {
          session.messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(tc.result)
          } as any)
        }

        session.activeToolCalls = []
        session.recursions++
        await this.saveSession()
        globalAgentRuntime.setPhase('executing')
      } else {
        // No tool calls means the agent is ready to respond
        console.log(`[AGENT_TRACE] LOOP_BREAK_NO_TOOLS loopTraceId=${loopTraceId} responseChars=${responseBuffer.length}`)
        break
      }
    }

    if (session.recursions >= MAX_RECURSIONS) {
      await this.archiveCorruptedSession(session, `Recursion limit reached (${session.recursions})`)
      return
    }

    // Finished running Agent Loop
    this.updateSessionPhase(session, 'responding')
    globalAgentRuntime.setPhase('responding')

    // Speak final chunk
      if (this.voiceManager && this.voiceManager.getStatus().enabled && !this.voiceManager.getStatus().muted) {
      if (sentenceBuffer.trim().length > 0) {
        this.voiceManager.speak(sentenceBuffer.trim(), voiceReqId, requestId).catch(() => {})
      }
    }

    await this.eventStore.log({
      sessionId: session.sessionId,
      correlationId: session.correlationId,
      event: 'SESSION_COMPLETE',
      payload: { outputLength: sentenceBuffer.length }
    })

    await this.clearSession()
  }

  private async executePendingTools(
    session: AgentSession,
    toolCalls: AgentSession['activeToolCalls'],
    eventSender: any,
    signal: AbortSignal,
    isRecovered = false
  ): Promise<void> {
    if (this.safeMode) {
      console.warn('[AGENT_SAFE_MODE] executePendingTools called but Safe Mode is active. Blocking all tools.')
      for (const tc of toolCalls) {
        tc.status = 'completed'
        tc.result = { success: false, error: 'Tools disabled in Safe Mode' }
      }
      await this.saveSession()
      return
    }
    const capabilityCtx: CapabilityContext = {
      scopes: ['system', 'memory:read', 'memory:write', 'search.web', 'youtube.readonly', 'multimedia:process'],
      approvedTools: isRecovered ? toolCalls.map(tc => tc.name) : []
    }

    const toolCtx = {
      memoryManager: this.memoryManager,
      oauthManager: this.oauthManager,
      retrievalOrchestrator: this.retrievalOrchestrator,
      capabilityCtx,
      logInfo: (msg: string) => console.log(msg),
      logError: (msg: string, err?: any) => console.error(msg, err)
    }

    for (const tc of toolCalls) {
      if (signal.aborted) return

      // Verify tool approval rules if specified
      const def = this.toolRegistry.getToolDefinitions().find(t => t.function.name === tc.name)?.function
      if (def && def.requiresApproval && !capabilityCtx.approvedTools.includes(tc.name)) {
        console.log(`[AGENT] Pausing execution for approval of tool: ${tc.name}`)
        eventSender.send('agent:tool-approval-requested', { toolName: tc.name, capabilities: def.capabilities || [] })
        
        const approved = await new Promise<boolean>((resolve) => {
          this.toolApprovalResolver = resolve
        })
        this.toolApprovalResolver = null

        if (!approved) {
          tc.status = 'completed'
          tc.result = { success: false, error: 'User denied execution of this tool.' }
          await this.saveSession()
          continue
        }
        capabilityCtx.approvedTools.push(tc.name)
      }

      // Execute tool
      await this.eventStore.log({
        sessionId: session.sessionId,
        correlationId: session.correlationId,
        event: 'TOOL_START',
        payload: { tool: tc.name, arguments: tc.argsBuffer }
      })

      const start = Date.now()
      const result = await this.toolRegistry.execute(tc.name, tc.argsBuffer, toolCtx)
      
      tc.status = 'completed'
      tc.result = result
      await this.saveSession()

      await this.eventStore.log({
        sessionId: session.sessionId,
        correlationId: session.correlationId,
        event: 'TOOL_END',
        latency: Date.now() - start,
        payload: { tool: tc.name, success: result.success }
      })
    }
  }

  private updateSessionPhase(session: AgentSession, phase: string): void {
    if (!session) {
      console.warn('[AGENT] updateSessionPhase called with null session — skipping phase update', { phase })
      return
    }

    session.phase = phase
    session.timestamp = Date.now()
    this.saveSession().catch(err => console.error('[AGENT] Save session failed:', err))

    this.eventStore.log({
      sessionId: session.sessionId,
      correlationId: session.correlationId,
      event: 'PHASE_CHANGE',
      payload: { phase }
    })
  }

  private async saveSession(): Promise<void> {
    if (!this.currentSession) return
    
    this.savePromise = this.savePromise.then(async () => {
      if (!this.currentSession) return
      try {
        await fs.mkdir(join(this.sessionPath, '..'), { recursive: true })
        const tmpPath = this.sessionPath + '.tmp'
        await fs.writeFile(tmpPath, JSON.stringify(this.currentSession, null, 2), 'utf-8')
        await fs.rename(tmpPath, this.sessionPath)
      } catch (err: any) {
        console.error('[AGENT] Failed to write agent-session.json:', err)
      }
    })
    
    return this.savePromise
  }

  private async clearSession(): Promise<void> {
    // Capture the session id at the start to avoid clearing a newly-created session
    const sessionIdAtStart = this.currentSession?.sessionId
    await this.savePromise

    // If a new session was created while we were waiting, do not clear it
    if (this.currentSession && this.currentSession.sessionId !== sessionIdAtStart) {
      console.log('[AGENT] clearSession aborted: session changed during savePromise wait')
      return
    }

    this.currentSession = null
    try {
      await fs.unlink(this.sessionPath)
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error('[AGENT] Failed to delete agent-session.json:', err)
      }
    }
  }

  private logSessionError(reason: string): void {
    if (this.currentSession) {
      this.eventStore.log({
        sessionId: this.currentSession.sessionId,
        correlationId: this.currentSession.correlationId,
        event: 'SESSION_ERROR',
        failureReason: reason
      })
    }
  }

  private broadcast(channel: string, ...args: any[]) {
    BrowserWindow.getAllWindows().forEach(w => {
      try {
        if (!w.isDestroyed()) w.webContents.send(channel, ...args)
      } catch {}
    })
  }

  private _clearStallWatchdog(): void {
    if (this.stallWatchdog !== null) {
      clearTimeout(this.stallWatchdog)
      this.stallWatchdog = null
    }
  }
}
