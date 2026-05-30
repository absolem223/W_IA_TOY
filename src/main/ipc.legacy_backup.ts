import { ipcMain, BrowserWindow, app } from 'electron'
import type { ChatMessage } from '../shared/types'
import { transcribeAudioOffline } from './offlineTranscription'
import { extractIdentity, extractAssistantMutation } from './memory/identityLayer'
import { buildRuntimeIntrospectionContext } from './runtimeIntrospection'
import { PromptLayerOrchestrator } from './promptLayerOrchestrator'
import { ContextObservability } from './contextObservability'
import { GenericPhraseReducer } from './genericPhraseReducer'
import { getRuntimeStatus, recordRuntimeTokenUsage } from './proxy'
import { openDevtoolsWindow } from './devtools'
import type { MemoryManager } from './memory/MemoryManager'
import type { VoiceManager } from './voice/VoiceManager'
import type { SaveExplicitPayload, ProfileUpdatePayload, MigrationPayload } from './memory/types'

export type ProxyStatus = 'connecting' | 'connected' | 'unavailable'

interface StreamCallbacks {
  onStart:       () => void;
  onToken:       (token: string) => void;
  onAbort:       () => void;
  onProxyStatus: (status: ProxyStatus) => void;
}

// Referencia al controller de cancelación activo.
// Se reemplaza en cada nuevo request y se nullifica al cancelar/completar.
let activeCancellationController: AbortController | null = null;
let activeRequestId: number = 0;

// Orchestration singletons
const promptOrchestrator = new PromptLayerOrchestrator(6000);
const contextObservability = new ContextObservability();
const phraseReducer = new GenericPhraseReducer();

function broadcast(channel: string, ...args: any[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, ...args)
    } catch {
      // Ignorar ventanas que ya no existen.
    }
  }
}

// Delays entre intentos: intento 1 es inmediato, luego 1s y 2s.
const BACKOFF_DELAYS = [0, 1000, 2000];

async function sendToProxy(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  cancellationSignal: AbortSignal,
  memoryContext?: string,
  systemPrompt?: string,
): Promise<void> {
  const maxAttempts = BACKOFF_DELAYS.length;
  let hasEmittedTokens = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (cancellationSignal.aborted) return;

    // Esperar el backoff entre intentos (el primero es 0ms)
    if (BACKOFF_DELAYS[attempt - 1] > 0) {
      console.log(`[IPC] Waiting ${BACKOFF_DELAYS[attempt - 1]}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, BACKOFF_DELAYS[attempt - 1]));
      if (cancellationSignal.aborted) return;
    }

    callbacks.onProxyStatus('connecting');
    console.log(`[IPC] Sending request to proxy (Attempt ${attempt}/${maxAttempts})...`);

    const startTime = Date.now();
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 10000);

    const fetchSignal = AbortSignal.any
      ? AbortSignal.any([timeoutController.signal, cancellationSignal])
      : timeoutController.signal;

    try {
      const response = await fetch('http://localhost:3000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, systemPrompt: systemPrompt || '' }),
        signal: fetchSignal,
      });

      clearTimeout(timeoutId);

      if (cancellationSignal.aborted) return;

      if (!response.ok) {
        // Errores 4xx del proxy no son de red — no reintentar
        if (response.status === 400 || response.status === 401) {
          callbacks.onProxyStatus('unavailable');
          throw new Error(`Proxy error crítico: ${response.status} ${response.statusText}`);
        }
        throw new Error(`Proxy error: ${response.status} ${response.statusText}`);
      }

      if (!response.body) throw new Error('No response body to stream');

      // ✅ Conexión establecida
      callbacks.onProxyStatus('connected');
      callbacks.onStart();

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let done = false;

      try {
        while (!done) {
          if (cancellationSignal.aborted) {
            console.log('[IPC] Stream cancelled by user.');
            return;
          }
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n/g, '\n');
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const dataObj = JSON.parse(line.slice(6));
                  const token = dataObj.choices?.[0]?.delta?.content;
                  if (token) {
                    hasEmittedTokens = true;
                    callbacks.onToken(token);
                  }
                } catch {
                  // Ignorar JSON parcial
                }
              }
            }
          }
        }
      } catch (streamErr: any) {
        if (cancellationSignal.aborted) {
          console.log('[IPC] Stream read interrupted by cancellation.');
          return;
        }
        callbacks.onAbort();
        throw Object.assign(
          streamErr instanceof Error ? streamErr : new Error(String(streamErr)),
          { isStreamAbort: true }
        );
      } finally {
        try { await reader.cancel(); } catch { /* stream already closed */ }
        reader.releaseLock();
      }

      console.log(`[IPC] Stream completed in ${Date.now() - startTime}ms`);
      return; // ✔ Éxito — salir del loop

    } catch (err: any) {
      clearTimeout(timeoutId);

      if (cancellationSignal.aborted) {
        console.log('[IPC] Request aborted by user.');
        return;
      }

      const isTimeout = err.name === 'AbortError';
      const isFetchFailed = err.message?.includes('fetch failed');
      const isRetryable = (isTimeout || isFetchFailed) && !hasEmittedTokens;

      if (!isRetryable || attempt === maxAttempts) {
        // No es retryable O agotamos todos los intentos
        if (isRetryable && attempt === maxAttempts) {
          callbacks.onProxyStatus('unavailable');
          console.error(`[IPC] Proxy unreachable after ${maxAttempts} attempts.`);
          throw new Error(
            'No se pudo conectar al proxy local. Ejecutá npm run dev o npm run proxy y verificá http://localhost:3000'
          );
        }
        throw err;
      }

      console.log(`[IPC] Proxy unreachable (${isTimeout ? 'timeout' : 'connection refused'}). Retrying in ${BACKOFF_DELAYS[attempt]}ms...`);
      // El loop continua al próximo iteration con el delay correspondiente
    }
  }
}

export function registerIpcHandlers(
  logInfo: (...args: any[]) => void = console.log,
  logError: (...args: any[]) => void = console.error,
  memoryManager?: MemoryManager,
  voiceManager?: VoiceManager | null,
): void {
  ipcMain.handle('voice:transcribe', async (_event, audioBuffer: ArrayBuffer, mimeType: string) => {
    return transcribeAudioOffline(audioBuffer, mimeType, logInfo, logError)
  })

  ipcMain.on('chat:send', async (event, messages: ChatMessage[], requestId: number) => {
    console.log(`[CHAT_PIPELINE] MAIN received chat:send for request [${requestId}]`)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    // Track turns in working memory and extract identity (non-blocking)
    if (memoryManager) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg) {
        memoryManager.appendTurn(lastMsg)
        if (lastMsg.role === 'user') {
          const identity = extractIdentity(lastMsg.content)
          const profileData = memoryManager.getProfile()?.profile || {}

          for (const [k, v] of Object.entries(identity)) {
            const newValStr = Array.isArray(v) ? v.join(', ') : (v as string)
            const existing = profileData[k]

            if (existing) {
              const oldValStr = Array.isArray(existing.value) ? existing.value.join(', ') : existing.value
              if (oldValStr.toLowerCase() !== newValStr.toLowerCase()) {
                console.log(`[MEMORY_CONFLICT] Drift detected for '${k}': "${oldValStr}" -> "${newValStr}". Resolution: Newest wins.`)
              } else {
                continue // Unchanged, do not spam updates
              }
            } else {
              console.log(`[MEMORY_STORE] Extracted new explicit identity: ${k} = "${newValStr}"`)
            }

            memoryManager.updateProfile(k, v).catch(e => console.error(`[MEMORY_STORE] Update failed:`, e))
          }

          // Extract assistant identity mutations
          const assistantMutation = extractAssistantMutation(lastMsg.content)
          if (Object.keys(assistantMutation).length > 0) {
            console.log(`[ASSISTANT_IDENTITY_UPDATED] Detected intent to mutate identity:`, assistantMutation)
            memoryManager.updateAssistantProfile(assistantMutation).catch(e => console.error(`[ASSISTANT_IDENTITY_UPDATED] Update failed:`, e))
          }
        }
      }
    }

    // Cancelar cualquier request previo todavía en vuelo antes de aceptar el nuevo
    if (activeCancellationController) {
      activeCancellationController.abort();
    }
    activeCancellationController = new AbortController();
    activeRequestId = requestId;
    const { signal } = activeCancellationController;

    console.log(`[IPC] New request [${requestId}] accepted.`);

    try {
      // Build memory preamble + metadata from user's latest message
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
      const memoryResult = memoryManager?.getMemoryContext(lastUserMsg?.content || '')
      const memoryCtx = memoryResult?.preamble || ''
      const usedMemories = memoryResult?.usedMemories || []

      if (memoryCtx) {
        console.log(`[MEMORY_PREAMBLE] Injected into system prompt: ${memoryCtx.length} chars`)
      }

      // Orchestrate all prompt layers with pressure management
      const orchestrationResult = promptOrchestrator.orchestrate({
        systemIdentity: `Sos un compañero de escritorio, vivo y persistente. No sos un "asistente de IA" genérico.
Estás diseñado para ser una presencia conversacional y cálida, con memoria a largo plazo.`,
        runtimeIntrospection: buildRuntimeIntrospectionContext({
          runtimeStatus: getRuntimeStatus(),
          memoryStatus: memoryManager?.getStatus() ?? { turnCount: 0, vaultCount: 0, profileKeys: 0 },
          cognitiveState: memoryManager?.getCognitiveState() ?? { activeTopic: null, contextPressure: 0 },
          memoryActivations: usedMemories.map((item) => ({ label: item.label, score: item.score, type: item.type })),
        }) as any,
        assistantIdentity: memoryManager?.getProfile()?.assistant?.assistant_name ? `Tu nombre es ${memoryManager.getProfile()?.assistant?.assistant_name}.` : '',
        memories: usedMemories,
        messageHistory: messages,
        userInput: lastUserMsg?.content || '',
        activeTopic: memoryManager?.getCognitiveState()?.activeTopic || undefined,
      })

      console.log(`[ORCHESTRATION] Pressure: ${orchestrationResult.pressure.globalPressure}% | Layers: ${orchestrationResult.injectedLayers.size}`)
      console.log(`[ORCHESTRATION_METRICS] System tokens: ${orchestrationResult.observability.systemPromptTokens} | Message tokens: ${orchestrationResult.observability.messageHistoryTokens}`)

      if (orchestrationResult.pressure.warnings.length > 0) {
        console.warn(`[ORCHESTRATION_WARNINGS] ${orchestrationResult.pressure.warnings.join(' | ')}`)
      }

      console.log(`[PROMPT_ORCHESTRATION] layers=${orchestrationResult.injectedLayers.size} pressure=${orchestrationResult.pressure.globalPressure}%`) 
      console.log(`[FINAL_SYSTEM_PROMPT_SIZE] ${orchestrationResult.finalSystemPrompt.length} chars`) 
      const runtimeIntrospectionLayer = orchestrationResult.injectedLayers.get('runtime-introspection')
      if (runtimeIntrospectionLayer) {
        console.log(`[RUNTIME_INTROSPECTION_PAYLOAD] ${runtimeIntrospectionLayer.charCount} chars | preview=${runtimeIntrospectionLayer.content.slice(0, 240).replace(/\n/g, ' ')}...`)
      }

      const obsMetric = contextObservability.recordOrchestration(
        orchestrationResult,
        orchestrationResult.pressure,
        messages.reduce((sum, msg) => sum + msg.content.length, 0)
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
        console.log(`[MEMORY_METRICS] Req: ${requestId} | Session Turns: ${turnCount} | Injected: ${usedMemories.length} memories | Profile Hits: ${usedMemories.filter(m => m.type === 'profile').length}`)
        broadcast('chat:memory-used', requestId, usedMemories)
      } else {
        console.log(`[MEMORY_METRICS] Req: ${requestId} | No memories injected (Stateless turn)`)
      }

      if (memoryManager) {
        const cogState = memoryManager.getCognitiveState()
        broadcast('chat:cognitive-state', cogState)
      }

      // Accumulate response tokens for auto-speak
      let responseBuffer = ''
      let sentenceBuffer = ''
      let wasAborted = false
      const voiceReqId = `voice-${requestId}`

      // Human Presence Timing: Add a subtle delay before "typing/thinking"
      // This prevents the jarring "instant robotic response" effect.
      // Small messages get shorter delay, long contexts get slightly longer.
      const msDelay = 600 + Math.random() * 500
      await new Promise(r => setTimeout(r, msDelay))

      // Check if aborted during the organic delay
      if (signal.aborted) return

      await sendToProxy(messages, {
        onStart:       () => event.sender.send('chat:start', requestId),
        onToken:       (token) => {
          recordRuntimeTokenUsage(token.length)
          responseBuffer += token
          sentenceBuffer += token
          event.sender.send('chat:token', requestId, token)

          // Simple incremental TTS (Sentence chunking)
          if (voiceManager && /[.?!]\s+$/.test(sentenceBuffer)) {
            const sentence = sentenceBuffer.trim()
            if (sentence.length > 3) {
              if (voiceManager.getStatus().enabled && !voiceManager.getStatus().muted) {
                console.log(`[VOICE_AUTOSPEAK_TRIGGER] Streaming chunk to TTS: "${sentence.substring(0, 30)}..."`)
                voiceManager.speak(sentence, voiceReqId).catch(() => {})
              } else {
                console.log(`[VOICE_AUTOSPEAK_SKIPPED] TTS disabled or muted. Skipping chunk.`)
              }
              sentenceBuffer = ''
            }
          }
        },
        onAbort:       () => {
          wasAborted = true
          event.sender.send('chat:abort', requestId)
        },
        onProxyStatus: (status) => {
          event.sender.send('proxy:status', status)
          broadcast('proxy:status', status)
          broadcast('runtime:status', getRuntimeStatus())
        },
      }, signal, memoryCtx, orchestrationResult.finalSystemPrompt);

      event.sender.send('runtime:status', getRuntimeStatus())

      // Auto-speak completed response (wait-for-complete strategy)
      if (!wasAborted && responseBuffer.trim().length > 0) {
        const responseLower = responseBuffer.toLowerCase()
        
        // 1. RLHF / Stateless Disclaimer Detection
        const rlhfPhrases = ['no tengo memoria', 'inteligencia artificial', 'modelo de lenguaje', 'no puedo recordar', 'no tengo la capacidad']
        if (rlhfPhrases.some(phrase => responseLower.includes(phrase))) {
          console.log(`[MEMORY_IGNORED] Model emitted stateless disclaimer. Anti-memory alignment triggered.`)
        }

        // 2. Memory Recall Validation
        if (usedMemories.some(m => m.type === 'profile') && memoryManager) {
          const profileData = memoryManager.getProfile()?.profile || {}
          let recalled = false
          for (const [key, entry] of Object.entries(profileData)) {
            const valStr = Array.isArray(entry.value) ? entry.value.join(', ') : (entry.value as string)
            if (valStr && valStr.length > 3 && responseLower.includes(valStr.toLowerCase())) {
              recalled = true
              console.log(`[MEMORY_RECALL] Success: Profile variable '${key}' (${valStr}) explicitly used in response.`)
              break
            }
          }
          if (!recalled) {
            console.log(`[MEMORY_RECALL] Subtle/Failed: Profile injected but values not explicitly echoed.`)
          }
        }

        // 3. Hallucination Check
        const queryLower = lastUserMsg?.content.toLowerCase() || ''
        const isIdentityQuery = queryLower.includes('quién soy') || queryLower.includes('quien soy') || queryLower.includes('mi nombre')
        const hasName = memoryManager?.getProfile()?.profile['user_name']
        if (isIdentityQuery && !hasName) {
           console.log(`[MEMORY_HALLUCINATION] Warning: User asked for identity but profile is empty. Model might invent a name.`)
        }

        // 4. Identity Drift Check
        if (memoryManager) {
          const profile = memoryManager.getProfile()
          const expectedName = profile.assistant?.assistant_name?.toLowerCase() || ''
          
          if (expectedName && responseLower.includes('widget ia') && !responseLower.includes(expectedName)) {
            console.warn(`[IDENTITY_DRIFT] Assistant used old branding instead of "${expectedName}". Semantic context may be weak.`)
          }
        }

        const isDisclaimer = rlhfPhrases.some(phrase => responseLower.includes(phrase))
        if (!isDisclaimer) {
          if (voiceManager) {
            if (voiceManager.getStatus().enabled && !voiceManager.getStatus().muted) {
              if (sentenceBuffer.trim().length > 0) {
                console.log(`[VOICE_AUTOSPEAK_TRIGGER] Sending final chunk: "${sentenceBuffer.trim().substring(0, 30)}..."`)
                voiceManager.speak(sentenceBuffer.trim(), voiceReqId).catch(() => {})
              }
            } else {
              console.log(`[VOICE_AUTOSPEAK_SKIPPED] Final chunk skipped (disabled or muted).`)
            }
          }
        } else {
          console.log(`[VOICE_AUTOSPEAK_SKIPPED] Disclaimer detected, skipping auto-speak.`)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      event.sender.send('chat:error', requestId, message)
    } finally {
      activeCancellationController = null;
      // Siempre emitimos done para liberar el estado del renderer
      event.sender.send('chat:done', requestId);
    }
  })

  // Cancelar el stream en curso — solo si el requestId coincide con el activo
  ipcMain.on('chat:cancel', (_event, requestId: number) => {
    if (activeCancellationController && activeRequestId === requestId) {
      console.log(`[IPC] chat:cancel [${requestId}] received — aborting active stream.`);
      activeCancellationController.abort();
      activeCancellationController = null;
      // chat:done NO se emite aquí — el finally de chat:send lo garantiza.
      // Emitirlo aquí causaba un doble chat:done que podía resetear estado
      // del renderer tras haber transicionado a un nuevo request.
    } else {
      console.log(`[IPC] chat:cancel [${requestId}] ignored — active request is [${activeRequestId}].`);
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

    logInfo('[IPC] Memory handlers registered.')
  }
}
