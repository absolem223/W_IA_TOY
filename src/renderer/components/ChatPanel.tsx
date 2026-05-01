import React from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { useChat } from '../hooks/useChat'

interface Props {
  isClosing?: boolean
}

export function ChatPanel({ isClosing = false }: Props): React.ReactElement {
  const { messages, isStreaming, sendMessage } = useChat()

  return (
    <div className={`chat-panel no-drag${isClosing ? ' chat-panel--closing' : ''}`}>
      <MessageList messages={messages} isStreaming={isStreaming} />
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  )
}
