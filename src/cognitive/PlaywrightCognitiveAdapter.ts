import type { ConversationTurn } from './types'

export interface PlaywrightLikePage {
  fill(selector: string, value: string): Promise<void>
  press(selector: string, key: string): Promise<void>
  waitForTimeout(ms: number): Promise<void>
  textContent(selector: string): Promise<string | null>
}

export interface PlaywrightConversationSelectors {
  input: string
  transcript: string
}

export interface PlaywrightSessionResult {
  turns: ConversationTurn[]
  transcript: string
}

export class PlaywrightCognitiveAdapter {
  constructor(private selectors: PlaywrightConversationSelectors) {}

  async runConversation(page: PlaywrightLikePage, userMessages: string[], delayMs = 50): Promise<PlaywrightSessionResult> {
    const turns: ConversationTurn[] = []
    for (const message of userMessages) {
      await page.fill(this.selectors.input, message)
      await page.press(this.selectors.input, 'Enter')
      await page.waitForTimeout(delayMs)
      turns.push({ role: 'user', text: message, timestamp: new Date() })
    }
    const transcript = await page.textContent(this.selectors.transcript)
    return {
      turns,
      transcript: transcript ?? '',
    }
  }
}
