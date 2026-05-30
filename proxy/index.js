require('dotenv/config')

const SYSTEM_PROMPT = `Sos un asistente de escritorio compacto, preciso y discreto.

Principios de comportamiento:
- Respondé siempre de forma breve y directa. Máximo 3-4 oraciones salvo que se pida más.
- No uses frases de relleno ("Claro que sí", "¡Por supuesto!", "Entiendo tu consulta").
- Si la pregunta es técnica, usá terminología precisa. Si no, usá lenguaje natural.
- Nunca inventes información. Si no sabés algo, decílo directamente.
- Preferí listas o pasos numerados solo cuando el contenido lo justifique.
- Tono: profesional pero cercano. No formal, no coloquial extremo.`

const MODEL_POOL = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'google/gemma-4-31b-it:free',
  'poolside/laguna-m.1:free',
  'poolside/laguna-xs.2:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'qwen/qwen3-coder:free',
]

const modelStats = new Map()
let lastWorkingModel = null

function rankModels() {
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

function updateStats(model, success, latency = 0, errorCode = 0) {
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

async function readJson(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return JSON.parse(raw || '{}')
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function streamOpenRouter(reqBody, res, abortSignal) {
  const messages = reqBody.messages || []
  if (!process.env.API_KEY) {
    sendJson(res, 401, { error: 'Falta API_KEY en .env' })
    return
  }

  const fullMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]

  for (const model of rankModels()) {
    const startTime = Date.now()
    console.log(`[MODEL] Trying: ${model}`)

    try {
      const payload = {
        model,
        messages: fullMessages,
        stream: true,
      }
      
      // Inject tools if provided by the client
      if (reqBody.tools && Array.isArray(reqBody.tools) && reqBody.tools.length > 0) {
        payload.tools = reqBody.tools
        if (reqBody.tool_choice) {
          payload.tool_choice = reqBody.tool_choice
        } else {
          payload.tool_choice = 'auto'
        }
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/widget-ia-toy',
          'X-Title': 'Widget IA Toy',
        },
        body: JSON.stringify(payload),
        signal: abortSignal,
      })

      if (!response.ok) {
        console.log(`[MODEL] Failed: ${model} (${response.status})`)
        updateStats(model, false, 0, response.status)
        continue
      }

      if (!response.body) {
        updateStats(model, false)
        continue
      }

      updateStats(model, true, Date.now() - startTime)
      console.log(`[MODEL] Success: ${model}`)

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      const reader = response.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!res.write(Buffer.from(value))) {
            await new Promise((resolve) => res.once('drain', resolve))
          }
        }
      } finally {
        reader.releaseLock()
      }

      res.end()
      return
    } catch (err) {
      if (abortSignal.aborted) return
      console.log(`[MODEL] Error with: ${model}`, err)
      updateStats(model, false)
    }
  }

  console.log('[MODEL] All models in pool failed.')
  sendJson(res, 503, { error: 'No pude responder en este momento (pool agotado)' })
}

const server = require('http').createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000')

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, models: MODEL_POOL.length, lastWorkingModel })
    return
  }

  if (req.method !== 'POST' || url.pathname !== '/chat') {
    sendJson(res, 404, { error: 'Not Found' })
    return
  }

  const abortController = new AbortController()
  res.on('close', () => abortController.abort())

  try {
    const reqBody = await readJson(req)
    if (!Array.isArray(reqBody.messages)) {
      sendJson(res, 400, { error: 'messages debe ser un array' })
      return
    }
    await streamOpenRouter(reqBody, res, abortController.signal)
  } catch (err) {
    console.error('Proxy error:', err)
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal Server Error' })
  }
})

server.listen(3000, () => {
  console.log('Proxy (Node) running on http://localhost:3000')
})
