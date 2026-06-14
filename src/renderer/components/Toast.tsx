import React, { useState, useEffect } from 'react'

interface ToastItem { id: number; text: string }

export function Toasts(): React.ReactElement {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    // Subscribe to main process alerts
    const off = window.electronAPI.onLLMStatusAlert((text: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000)
      setToasts(prev => [...prev, { id, text }])
      // Auto-remove after 4s
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 4000)
    })

    return () => off()
  }, [])

  if (toasts.length === 0) return <></>

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  )
}
