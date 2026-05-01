import type { ChatMessage } from '../../shared/types'

// The contract every AI provider must implement.
export interface AIProvider {
  stream(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
  ): Promise<void>
}
