import { useState, useEffect, useCallback, useRef } from 'react'
import type { ChatMessage } from '../../shared/types'
import { loadHistory, saveHistory, clearHistory } from '../utils/chatHistory'
import { useVoiceService } from '../services/voice'

export type ChatState = 'idle' | 'thinking' | 'streaming' | 'error'

export type ProxyStatus = 'idle' | 'connecting' | 'connected' | 'unavailable'

export interface MemoryUsedItem {
  type: string
  label: string
  score: number
}

interface UseChatReturn {
  messages:         ChatMessage[]
  chatState:        ChatState
  proxyStatus:      ProxyStatus
  isStreaming:      boolean
  currentRequestId: number
  usedMemories:     MemoryUsedItem[]
  activeTopic:      string | null
  agentStatus:      string | null
  sendMessage:      (text: string, metadata?: ChatMessage['metadata']) => void
  /** Insert a user message bubble immediately (e.g. voice transcription) without triggering the LLM pipeline. */
  addUserMessage:   (text: string, metadata?: ChatMessage['metadata']) => void
  clearChat:        () => void
}

export function useChat(): UseChatReturn {
  // Initialize from persisted history — loadHistory() is sync so safe in useState initializer
  const [messages,  setMessages]  = useState<ChatMessage[]>(loadHistory)
  const [chatState, setChatState] = useState<ChatState>('idle')
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>('idle')
  const [usedMemories, setUsedMemories] = useState<MemoryUsedItem[]>([])
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<string | null>(null)

  const voiceService = useVoiceService()

  // Incrementing counter — each send gets a unique id.
  // Stored in a ref to avoid stale closures in IPC listeners.
  const currentRequestIdRef = useRef(0);

  // isStreaming is a derived convenience for components that don't need full granularity
  const isStreaming = chatState === 'thinking' || chatState === 'streaming'

  useEffect(() => {
    const removeStart = window.electronAPI.onStart((requestId) => {
      if (requestId !== currentRequestIdRef.current) return;
      setChatState('thinking')
    })

    const removeToken = window.electronAPI.onToken((requestId, token) => {
      if (requestId !== currentRequestIdRef.current) return;
      setChatState('streaming')
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant') {
          return [...prev.slice(0, -1), { role: 'assistant', content: last.content + token }]
        }
        return [...prev, { role: 'assistant', content: token }]
      })
    })

    const removeDone = window.electronAPI.onDone((requestId) => {
      if (requestId !== currentRequestIdRef.current) return;
      // Save inside setMessages updater: we get the current array without stale closure.
      // This handles normal completion AND cancellation (cancel also fires chat:done).
      setMessages(prev => {
        saveHistory(prev)
        return prev
      })
      setTimeout(() => setChatState('idle'), 600)
    })

    const removeAbort = window.electronAPI.onAbort((requestId) => {
      if (requestId !== currentRequestIdRef.current) return;
      setChatState('error')
      setAgentStatus(null)
    })

    const removeError = window.electronAPI.onError((requestId, msg) => {
      if (requestId !== currentRequestIdRef.current) return;
      setChatState('error')
      setMessages((prev) => {
        const next = [...prev, { role: 'assistant' as const, content: `⚠ Error: ${msg}` }]
        saveHistory(next)  // persist the error message as part of history
        return next
      })
      setAgentStatus(null)
      setTimeout(() => setChatState('idle'), 4000)
    })

    const removeProxyStatus = window.electronAPI.onProxyStatus((status) => {
      setProxyStatus(status)
      if (status === 'connected' || status === 'unavailable') {
        // Reset to idle eventually if it was connecting, so the UI doesn't get stuck showing connecting status forever if it connects.
        setTimeout(() => {
            setProxyStatus(prev => prev === status ? 'idle' : prev)
        }, 3000)
      }
    })

    const removeMemoryUsed = window.electronAPI.onMemoryUsed((reqId, mems) => {
      if (reqId === currentRequestIdRef.current) {
        setUsedMemories(mems)
      }
    })

    const removeCognitiveState = window.electronAPI.onCognitiveState((state) => {
      setActiveTopic(state.activeTopic)
    })

    const removeAgentStatus = window.electronAPI.onAgentStatus((status) => {
      setAgentStatus(status)
    })

    const removeModelInfo = window.electronAPI.onModelInfo((requestId, info) => {
      if (requestId !== currentRequestIdRef.current) return;
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant') {
          const updated = {
            ...last,
            metadata: {
              ...last.metadata,
              modelInfo: info
            }
          }
          const next = [...prev.slice(0, -1), updated]
          saveHistory(next)
          return next
        }
        return prev
      })
    })

    return () => {
      removeStart()
      removeToken()
      removeDone()
      removeAbort()
      removeError()
      removeProxyStatus()
      removeMemoryUsed()
      removeCognitiveState()
      removeAgentStatus()
      removeModelInfo()
      // System messages from main process (e.g., provider change notices)
      if (typeof window.electronAPI.onSystemMessage === 'function') {
        const removeSystem = window.electronAPI.onSystemMessage((text: string) => {
          // noop — removal handled below by invoking the returned function immediately
        })
        removeSystem()
      }
    }
  }, []) // Listeners se registran una vez; currentRequestIdRef nunca es stale

  // Register system-message handler to insert system-visible chat messages
  useEffect(() => {
    if (typeof window.electronAPI.onSystemMessage !== 'function') return
    const remove = window.electronAPI.onSystemMessage((text: string) => {
      // Insert as an assistant message with metadata marker so renderer can style it
      setMessages(prev => {
        const next = [...prev, { role: 'assistant' as const, content: text, metadata: { sessionType: 'system' } }]
        saveHistory(next)
        return next
      })
    })
    return () => remove()
  }, [])

  // Auto-send voice transcription once final text is received
  useEffect(() => {
    const finalSub = voiceService.subscribeFinalTranscript((text) => {
      if (text.trim()) {
        sendMessage(text, { fromVoice: true })
      }
    })
    return () => finalSub.unsubscribe()
  }, [voiceService, sendMessage])

  const sendMessage = useCallback((text: string, metadata?: ChatMessage['metadata']) => {
    const requestId = ++currentRequestIdRef.current;
    // No global side-effects: other renderer subsystems should rely on IPC events
    // (chat:start / chat:done) to learn the active requestId.
    setUsedMemories([]) // Clear previous memory metadata
    const userMsg: ChatMessage = { role: 'user', content: text, ...(metadata ? { metadata } : {}) }
    setMessages((prev) => {
      const next = [...prev, userMsg]
      saveHistory(next)  // user message is always final — persist immediately
      window.electronAPI.sendMessages(next, requestId)
      return next
    })
    // chatState transiciona a 'thinking' cuando llega chat:start desde ipc.ts
  }, [])

  /**
   * Insert a user message bubble immediately without triggering the LLM.
   * Used by ChatInput to show voice transcriptions in the chat before onSend fires.
   */
  const addUserMessage = useCallback((text: string, metadata?: ChatMessage['metadata']) => {
    const msg: ChatMessage = { role: 'user', content: text, ...(metadata ? { metadata } : {}) }
    setMessages((prev) => {
      const next = [...prev, msg]
      saveHistory(next)
      return next
    })
  }, [])

  const clearChat = useCallback(() => {
    clearHistory()
    setMessages([])
    setChatState('idle')
    setAgentStatus(null)
  }, [])

  return { messages, chatState, proxyStatus, isStreaming, currentRequestId: currentRequestIdRef.current, usedMemories, activeTopic, agentStatus, sendMessage, addUserMessage, clearChat }
}
