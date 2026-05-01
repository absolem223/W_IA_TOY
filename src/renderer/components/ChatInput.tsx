import React, { useState } from 'react'

interface Props {
  onSend:   (text: string) => void
  disabled: boolean
}

export function ChatInput({ onSend, disabled }: Props): React.ReactElement {
  const [value, setValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e as unknown as React.FormEvent)
  }

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <input
        id="chat-field"
        className="chat-input__field"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escribí un mensaje…"
        disabled={disabled}
        autoFocus
        autoComplete="off"
      />
      <button
        id="chat-send"
        className="chat-input__send"
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Enviar"
      >
        ↑
      </button>
    </form>
  )
}
