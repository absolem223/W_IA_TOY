require('dotenv').config()

async function testTools() {
  const OPENROUTER_URL = process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1/chat/completions'
  const API_KEY = process.env.API_KEY

  if (!API_KEY) {
    console.error('Falta API_KEY en .env')
    process.exit(1)
  }

  const models = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'google/gemma-4-31b-it:free',
    'poolside/laguna-m.1:free',
    'nousresearch/hermes-3-llama-3.1-405b:free'
  ]

  for (const model of models) {
    console.log(`\n===========================================`)
    console.log(`TESTING MODEL: ${model}`)
    console.log(`===========================================`)

    const payload = {
      model: model,
      messages: [{ role: 'user', content: 'Use the ping_tool to echo "hello world"' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'ping_tool',
            description: 'Minimal diagnostic tool',
            parameters: {
              type: 'object',
              properties: { echo: { type: 'string' } },
              required: ['echo']
            }
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'ping_tool' } },
      stream: true
    }

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/widget-ia-toy',
          'X-Title': 'Argos Isolation Test'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        console.error(`ERROR: ${response.status} ${response.statusText}`)
        continue
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let isTextFallback = false
      let finishReason = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              const delta = data.choices?.[0]?.delta
              if (delta?.content && delta.content.trim() !== '') {
                isTextFallback = true
                process.stdout.write(delta.content)
              }
              if (delta?.tool_calls) {
                console.log(`\nTOOL_CALL DELTA:`, JSON.stringify(delta.tool_calls))
              }
              if (data.choices?.[0]?.finish_reason) {
                finishReason = data.choices[0].finish_reason
              }
            } catch (e) {}
          }
        }
      }
      console.log(`\n\nFINISH_REASON: ${finishReason}`)
      if (isTextFallback) {
        console.log(`[!] ALERT: Model responded with text instead of tool call.`)
      } else {
        console.log(`[SUCCESS] Model respected tool choice.`)
      }
    } catch (e) {
      console.error('Request failed:', e)
    }
  }
}

testTools()
