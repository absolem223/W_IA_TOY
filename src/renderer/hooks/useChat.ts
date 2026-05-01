import { useState, useEffect, useCallback } from 'react'
import type { ChatMessage } from '../../shared/types'

interface UseChatReturn {
  messages:    ChatMessage[]
  isStreaming: boolean
  sendMessage: (text: string) => void
}

export function useChat(): UseChatReturn {
  const [messages,    setMessages]    = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  useEffect(() => {
    const removeToken = window.electronAPI.onToken((token) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        // Append token to existing assistant message, or start a new one
        if (last?.role === 'assistant') {
          return [...prev.slice(0, -1), { role: 'assistant', content: last.content + token }]
        }
        return [...prev, { role: 'assistant', content: token }]
      })
    })

    const removeDone = window.electronAPI.onDone(() => {
      setIsStreaming(false)
    })

    const removeError = window.electronAPI.onError((msg) => {
      setIsStreaming(false)
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠ Error: ${msg}` }])
    })

    return () => {
      removeToken()
      removeDone()
      removeError()
    }
  }, [])

  const sendMessage = useCallback((text: string) => {
    const userMsg: ChatMessage = { role: 'user', content: text }
    setMessages((prev) => {
      const next = [...prev, userMsg]
      // Send full history so the AI has context
      window.electronAPI.sendMessages(next)
      return next
    })
    setIsStreaming(true)
  }, [])

  return { messages, isStreaming, sendMessage }
}
