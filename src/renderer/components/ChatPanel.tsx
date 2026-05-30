import React from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { VoiceControls } from './VoiceControls'
import { DebugOverlay } from './DebugOverlay'
import { useChat } from '../hooks/useChat'
import { useVoice } from '../hooks/useVoice'

interface Props {
  isClosing?: boolean
}

export function ChatPanel({ isClosing = false }: Props): React.ReactElement {
  const { messages, chatState, proxyStatus, isStreaming, currentRequestId, usedMemories, activeTopic, agentStatus, sendMessage, clearChat } = useChat()
  const { voiceState, enabled, muted, toggleMute, stop } = useVoice()

  return (
    <div className={`chat-panel no-drag${isClosing ? ' chat-panel--closing' : ''}`}>
      <MessageList messages={messages} isStreaming={isStreaming} usedMemories={usedMemories} agentStatus={agentStatus} />
      <DebugOverlay usedMemories={usedMemories} activeTopic={activeTopic} />
      {activeTopic && (
        <div className="active-topic-indicator">
          Focus: {activeTopic}
        </div>
      )}
      {/* ── Footer ── */}
      <div className="chat-panel__footer">
        <ChatInput onSend={sendMessage} onClearChat={clearChat} chatState={chatState} proxyStatus={proxyStatus} currentRequestId={currentRequestId} />
        <VoiceControls voiceState={voiceState} enabled={enabled} muted={muted} onToggleMute={toggleMute} onStop={stop} />
      </div>
    </div>
  )
}

