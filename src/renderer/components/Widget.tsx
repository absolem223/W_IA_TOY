import React, { useState, useCallback, useEffect, useRef } from 'react'
import { WidgetHeader } from './WidgetHeader'
import { ChatPanel } from './ChatPanel'

const HEIGHT_CLOSED = 60
const HEIGHT_OPEN   = 540
const CLOSE_ANIM_MS = 350 // debe ser <= --dur-slow (380ms)

/** Aproximación al contexto de fondo usando la preferencia de color del OS.
 *  No detecta el wallpaper real (requeriría desktopCapturer + permisos).
 *  Correlación suficiente: dark-mode → fondo oscuro, light-mode → fondo claro. */
function useBgContext(): 'dark' | 'light' {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const [ctx, setCtx] = useState<'dark' | 'light'>(mq.matches ? 'dark' : 'light')

  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => setCtx(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mq])

  return ctx
}

export function Widget(): React.ReactElement {
  const [isOpen, setIsOpen]       = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const closingTimer              = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bgContext                 = useBgContext()

  const toggle = useCallback(() => {
    if (isOpen) {
      // Cierre: animación CSS primero, luego unmount y resize
      setIsClosing(true)
      closingTimer.current = setTimeout(() => {
        setIsClosing(false)
        setIsOpen(false)
        window.electronAPI.resizeWindow(HEIGHT_CLOSED)
        window.electronAPI.setPanelState(false)
      }, CLOSE_ANIM_MS)
    } else {
      if (closingTimer.current) clearTimeout(closingTimer.current)
      window.electronAPI.resizeWindow(HEIGHT_OPEN)
      window.electronAPI.setPanelState(true)
      setIsOpen(true)
    }
  }, [isOpen])

  return (
    <div
      className="widget"
      data-open={String(isOpen && !isClosing)}
      data-bg={bgContext}
      data-event="idle-pulse"
    >
      <WidgetHeader isOpen={isOpen} onToggle={toggle} />
      {isOpen && <ChatPanel isClosing={isClosing} />}
    </div>
  )
}
