import type { AIProvider } from '../types'
import type { ChatMessage } from '../../../shared/types'

interface Config {
  apiKey: string
  model: string
  baseURL?: string
}

export class OpenAIProvider implements AIProvider {
  private readonly config: Config

  constructor(config: Config) {
    this.config = config
  }

  async stream(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
  ): Promise<void> {
    const base = this.config.baseURL ?? 'https://api.openai.com'

    const response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ model: this.config.model, messages, stream: true }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    const reader  = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const lines = decoder.decode(value, { stream: true }).split('\n')

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') { onDone(); return }

        try {
          const json  = JSON.parse(data)
          const token: string = json.choices?.[0]?.delta?.content ?? ''
          if (token) onToken(token)
        } catch {
          // skip malformed SSE chunks
        }
      }
    }

    onDone()
  }
}
