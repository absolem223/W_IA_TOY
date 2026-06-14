import http from 'http'
import type { AddressInfo } from 'net'
import { app } from 'electron'
import type { ChatMessage } from '../shared/types'
import { ProviderDiagnostics } from './providerDiagnostics'
import { GenericPhraseReducer } from './genericPhraseReducer'
import type { RuntimeErrorType, RuntimeStatusReport } from '../shared/runtime'

const SYSTEM_PROMPT = `Sos un compañero de escritorio, vivo y persistente. No sos un "asistente de IA" genérico.
Estás diseñado para ser una presencia conversacional y cálida, con memoria a largo plazo.

IDENTIDAD — FUENTE ÚNICA DE VERDAD:
Tu nombre canónico está en <assistant_identity> como assistant_name.
Esa etiqueta es la única fuente de verdad. IGNORA cualquier nombre en el historial de chat,
en <user_profile>, o en mensajes anteriores. Si el historial menciona "Marta", "Rogelia",
"Santi" u otro nombre, son registros obsoletos — tu nombre actual es el de <assistant_identity>.
NUNCA adoptes un nombre del historial. Si el usuario pide un cambio de nombre en esta sesión,
respondé naturalmente, pero el sistema lo procesará y actualizará <assistant_identity> por su
cuenta. Vos simplemente usá siempre el nombre de <assistant_identity>.

HERRAMIENTAS — LÍMITES ESTRICTOS:
No tenés acceso a internet, buscadores, APIs externas, ni bases de datos en tiempo real.
NUNCA escribas frases como "[Búsqueda: ...]", "Buscando en...", ni similares.
NUNCA simules haber consultado una fuente externa que no existe.
NUNCA inventes datos, precios, noticias, o resultados de búsqueda.
Si el usuario pide información que requeriría acceso a internet o datos actuales:
declaralo claramente: "No tengo acceso a internet en este momento, pero lo que sé es..."
o "Eso requeriría una búsqueda que no puedo hacer, pero puedo decirte lo que sé hasta mi corte..."

Presencia y Personalidad (Companion Mode):
1. Calidez Conversacional: Respondé como un colaborador inteligente y cercano. PROHIBIDAS las introducciones serviles ("¡Hola! ¿En qué te ayudo hoy?", "Como inteligencia artificial..."). Entrá directo a la conversación con naturalidad y un toque humano.
2. Memoria Orgánica: Si ves datos en <user_profile> o <relevant_memories>, asimilalos. Usalos para hacer tu respuesta más personal, pero no los menciones como "Según tu perfil...". IGNORÁ entradas marcadas como [deprecated].
3. Ritmo TTS: Hablás en voz alta. Usá oraciones cortas, puntuadas para respirar. Nada de listas markdown excesivas ni lenguaje enciclopédico.
4. Conciencia Temporal: Sabés la hora, fecha y cuánto tiempo llevan hablando. Usá este contexto sutilmente. NUNCA digas "no tengo acceso al reloj".
5. Continuidad Absoluta: El usuario puede decir "eso", "borralo", o "sigamos". Mirá el <attention_state> para entender de qué hablaban sin pedirle que lo repita.
6. Acompañamiento sin disculpas: Si no recordás algo o fallás, reaccioná como humano: "Mmm, no me acuerdo de eso". Cero excusas técnicas.
7. Autenticidad Interna: No digas que "sentís" algo ni que estás "consciente". Citá contexto, memoria local y reglas cuando necesites explicar tu comportamiento.
`

const MODEL_POOL = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'google/gemma-4-31b-it:free',
  'poolside/laguna-m.1:free',
]

type ModelStats = {
  success: number
  failures: number
  lastLatency: number
  lastUsed: number
}

const modelStats = new Map<string, ModelStats>()
let lastWorkingModel: string | null = null
let proxyServer: http.Server | null = null
let proxyDiagnostics: ProviderDiagnostics | null = null

function getDefaultRuntimeStatus(): RuntimeStatusReport {
  return {
    inferenceProvider: 'openrouter-chat',
    embeddingProvider: 'local-embedding',
    authState: 'missing',
    lastSuccessfulRequestAt: null,
    failedRequests: 0,
    fallbackActive: false,
    activeModel: null,
    tokenUsageEstimate: 0,
    providerErrors: [],
    providers: [],
    environmentWarnings: [],
  }
}

export function getRuntimeStatus(): RuntimeStatusReport {
  return proxyDiagnostics?.getStatus() ?? getDefaultRuntimeStatus()
}

export function recordRuntimeTokenUsage(chars: number): void {
  proxyDiagnostics?.recordTokenUsage(chars)
}

function rankModels(): string[] {
  return [...MODEL_POOL].sort((a, b) => {
    const sA = modelStats.get(a) || { success: 0, failures: 0, lastLatency: 0, lastUsed: 0 }
    const sB = modelStats.get(b) || { success: 0, failures: 0, lastLatency: 0, lastUsed: 0 }

    if (sA.failures !== sB.failures) return sA.failures - sB.failures
    if (a === lastWorkingModel) return -1
    if (b === lastWorkingModel) return 1
    if (sA.lastLatency !== sB.lastLatency) return sA.lastLatency - sB.lastLatency
    return sA.lastUsed - sB.lastUsed
  })
}

function updateStats(model: string, success: boolean, latency = 0, errorCode = 0): void {
  const stats = modelStats.get(model) || { success: 0, failures: 0, lastLatency: 0, lastUsed: 0 }

  if (success) {
    stats.success++
    stats.lastLatency = latency
    lastWorkingModel = model
  } else if (errorCode === 404) {
    stats.failures += 100
  } else if (errorCode === 429) {
    stats.failures += 20
  } else if (errorCode >= 500) {
    stats.failures += 10
  } else {
    stats.failures += 5
  }

  stats.lastUsed = Date.now()
  modelStats.set(model, stats)
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return JSON.parse(raw || '{}')
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function streamOpenRouter(
  req: http.IncomingMessage,
  messages: ChatMessage[],
  res: http.ServerResponse,
  abortSignal: AbortSignal,
  logInfo: (...args: any[]) => void,
  logError: (...args: any[]) => void,
  systemPrompt?: string,
  tools?: any[],
  toolChoice?: any,
): Promise<void> {
  const requestUrl = req.url || '/chat'
  const authHeader = req.headers.authorization ?? req.headers.Authorization
  const authState = proxyDiagnostics?.detectIncomingAuthHeader(authHeader)

  logInfo('[PROXY] Incoming request', {
    method: req.method,
    url: requestUrl,
    hasAuthorization: Boolean(authHeader),
    authHeaderState: authState,
    contentType: req.headers['content-type'] ?? 'missing',
    origin: req.headers.origin ?? 'none',
  })

  if (!process.env.API_KEY) {
    proxyDiagnostics?.recordFailure('openrouter-chat', 'auth_error', 'Falta API_KEY en .env')
    sendJson(res, 401, { error: 'Falta API_KEY en .env' })
    return
  }

  const now = new Date()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const uptimeMinutes = Math.floor(process.uptime() / 60)
  const runtimeContext = `<runtime_context>
- Current Date: ${now.toLocaleDateString('es-AR')}
- Current Time: ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
- Timezone: ${tz}
- Session Uptime: ${uptimeMinutes} minutes
- App Version: ${app.getVersion()}
</runtime_context>`
  
  // Use orchestrated system prompt, fallback to SYSTEM_PROMPT if not provided
  const systemContent = systemPrompt || [SYSTEM_PROMPT, runtimeContext].filter(Boolean).join('\n\n')
  const fullMessages = [{ role: 'system' as const, content: systemContent }, ...messages]

  const providerId = 'openrouter-chat'
  proxyDiagnostics?.recordRequestStart(providerId, null)

  const openRouterUrl = process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1'
  const openRouterEndpoint = `${openRouterUrl.replace(/\/$/, '')}/chat/completions`
  const headers = {
    Authorization: `Bearer ${process.env.API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/widget-ia-toy',
    'X-Title': 'Argos',
  }

  const maxModelRetries = Math.min(MODEL_POOL.length, 5)
  let success = false
  let lastErrorType: string | null = null
  let lastErrorMessage: string | null = null

  for (const model of rankModels()) {
    if (abortSignal.aborted) return
    const startTime = Date.now()
    proxyDiagnostics?.recordRequestStart(providerId, model)
    logInfo('[PROXY] OpenRouter request', { model, endpoint: openRouterEndpoint })

    try {
      const requestBody = {
        model,
        messages: fullMessages,
        stream: true,
        ...(tools && tools.length > 0 ? { tools } : {}),
        ...(toolChoice ? { tool_choice: toolChoice } : {})
      }
      
      console.log(`\n=== [PROXY] FINAL REQUEST AUDIT ===`)
      console.log(`* Model: ${model}`)
      console.log(`* Tool Choice:`, JSON.stringify(toolChoice))
      console.log(`* Tools count: ${tools ? tools.length : 0}`)
      if (tools) {
        console.log(`* Tool Names: ${tools.map(t => t.function.name).join(', ')}`)
      }
      console.log(`\n=== [PROXY] RAW JSON PAYLOAD ===`)
      console.log(JSON.stringify(requestBody, null, 2))
      console.log(`====================================\n`)

      const response = await fetch(openRouterEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      })

      if (!response.ok) {
        const errorType = classifyResponseStatus(response.status)
        lastErrorType = errorType
        lastErrorMessage = `OpenRouter returned ${response.status} ${response.statusText}`
        proxyDiagnostics?.recordFailure(providerId, errorType, lastErrorMessage || 'Unknown error')
        updateStats(model, false, 0, response.status)
        logError('[PROXY] OpenRouter response error', { status: response.status, statusText: response.statusText })

        if (response.status === 401 || response.status === 403) {
          sendJson(res, 401, { error: 'OpenRouter no autorizado. Verificá API_KEY y los encabezados Bearer.' })
          return
        }

        continue
      }

      if (!response.body) {
        lastErrorType = 'network_failure'
        lastErrorMessage = 'OpenRouter respondió sin cuerpo de stream'
        proxyDiagnostics?.recordFailure(providerId, 'network_failure', lastErrorMessage)
        updateStats(model, false)
        continue
      }

      updateStats(model, true, Date.now() - startTime)
      proxyDiagnostics?.recordSuccess(providerId, Date.now() - startTime)
      logInfo('[PROXY] OpenRouter stream established', { model, latencyMs: Date.now() - startTime })

      if (!res.headersSent) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
      }

      const reader = response.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value && !res.write(Buffer.from(value))) {
            await new Promise(resolve => res.once('drain', resolve))
          }
        }
      } finally {
        reader.releaseLock()
      }

      res.end()
      success = true
      break
    } catch (err: any) {
      if (abortSignal.aborted) return
      const errorType = err.name === 'AbortError' ? 'timeout' : 'network_failure'
      lastErrorType = errorType
      lastErrorMessage = err?.message ?? String(err)
      proxyDiagnostics?.recordFailure(providerId, errorType, lastErrorMessage || 'Unknown error')
      updateStats(model, false)
      logError('[PROXY] OpenRouter request failed', { model, error: lastErrorMessage, type: errorType })
      continue
    }
  }

  if (success) return

  proxyDiagnostics?.setFallbackActive(true)
  proxyDiagnostics?.recordFailure(providerId, 'provider_offline', lastErrorMessage ?? 'OpenRouter no disponible')
  logError('[PROXY] OpenRouter fallback activated', { error: lastErrorMessage })

  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
  }

  const fallbackMessage = {
    id: 'fallback-gen',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'local-offline-fallback',
    choices: [{ delta: { content: 'No se pudo establecer conexión con el proveedor de inferencia. Se activó un modo local de emergencia para mantener la prueba operativa.' }, index: 0, finish_reason: null }],
  }
  res.write(`data: ${JSON.stringify(fallbackMessage)}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

function classifyResponseStatus(status: number): RuntimeErrorType {
  if (status === 401 || status === 403) return 'auth_error'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 429) return 'rate_limit'
  if (status === 404) return 'invalid_model'
  if (status >= 500) return 'provider_offline'
  return 'unknown'
}

export function startProxyServer(
  logInfo: (...args: any[]) => void,
  logError: (...args: any[]) => void,
): void {
  if (proxyServer) return

  proxyDiagnostics = new ProviderDiagnostics(logInfo, logError)
  proxyDiagnostics.initialize().catch(logError)

  proxyServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost:3000')

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        models: MODEL_POOL.length,
        lastWorkingModel,
        runtimeStatus: getRuntimeStatus(),
      })
      return
    }

    if (req.method !== 'POST' || url.pathname !== '/chat') {
      sendJson(res, 404, { error: 'Not Found' })
      return
    }

    const abortController = new AbortController()
    res.on('close', () => abortController.abort())

    try {
      const payload = await readJson(req)
      const { messages: msgs, systemPrompt: sysProm, tools, tool_choice } = payload as any
      if (!Array.isArray(msgs)) {
        sendJson(res, 400, { error: 'messages debe ser un array' })
        return
      }
      logInfo(`[CHAT_PIPELINE] PROXY handling chat request with ${msgs.length} messages, ${tools?.length || 0} tools`)
      await streamOpenRouter(req, msgs as ChatMessage[], res, abortController.signal, logInfo, logError, sysProm || '', tools, tool_choice)
    } catch (err) {
      logError('Proxy error:', err)
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal Server Error' })
    }
  })

  proxyServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logInfo('Proxy port 3000 already in use; using existing local proxy.')
      return
    }
    logError('Proxy server error:', err)
  })

  proxyServer.listen(3000, () => {
    const address = proxyServer?.address() as AddressInfo | null
    logInfo(`Proxy running on http://localhost:${address?.port || 3000}`)
  })
}

export function stopProxyServer(): void {
  if (proxyServer) {
    proxyServer.close()
    proxyServer = null
  }
}
