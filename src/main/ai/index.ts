import type { AIProvider } from './types'
import { OpenAIProvider } from './providers/openai'

// Single instantiation point.
// To switch providers: swap the class here, nothing else changes.
let _provider: AIProvider | null = null

export function getProvider(): AIProvider {
  if (!_provider) {
    _provider = new OpenAIProvider({
      apiKey: process.env['OPENAI_API_KEY'] ?? '',
      model:  process.env['OPENAI_MODEL']   ?? 'gpt-4o-mini',
    })
  }
  return _provider
}
