import React, { useState, useCallback, useEffect, useRef } from 'react'
import { WidgetHeader } from './WidgetHeader'
import { ChatPanel } from './ChatPanel'
import { MemoryPanel } from './MemoryPanel'
import { ApprovalOverlay } from './ApprovalOverlay'
import { useWidgetLayers } from '../hooks/useWidgetLayers'
import { Toasts } from './Toast'
import { ModelSetupModal } from './ModelSetupModal'
import type { VersionInfo } from '../../shared/versionTypes'


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
  const [showModelSetup, setShowModelSetup] = useState(false)
  const [view, setView]           = useState<'chat' | 'memory'>('chat')
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)

  useEffect(() => {
    window.electronAPI.getVersionInfo().then(setVersionInfo).catch(console.error)
  }, [])
  const closingTimer              = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bgContext                 = useBgContext()
  const layers                    = useWidgetLayers()
  const { isClosing, setIsClosing } = layers

  const toggle = useCallback(() => {
    if (isOpen) {
      // Cierre: animación CSS primero, luego unmount y resize
      setIsClosing(true)
      closingTimer.current = setTimeout(() => {
        setIsClosing(false)
        setIsOpen(false)
        setView('chat') // reset to chat on close
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

  const toggleMemory = useCallback(() => {
    setView(v => v === 'memory' ? 'chat' : 'memory')
  }, [])

  useEffect(() => {
    if (typeof window.electronAPI.onShowBios === 'function') {
      const off = window.electronAPI.onShowBios(() => {
        console.log('[BIOS] Modal triggered')
        setShowModelSetup(true)
      })
      return () => off()
    }
    return () => {}
  }, [])

  return (
    <div
      className="widget"
      data-open={String(isOpen && !isClosing)}
      data-bg={bgContext}
      data-event="idle-pulse"
    >
      {/* El header siempre visible y siempre clickeable.
          Electron maneja el resize de ventana — no necesitamos
          bloquear pointer-events en CSS para "ocultar" el área. */}
      <WidgetHeader isOpen={isOpen} onToggle={toggle} onMemoryToggle={toggleMemory} memoryActive={view === 'memory'} versionInfo={versionInfo} />

      {/* Panel de contenido: solo se monta cuando el widget está abierto.
          pointer-events:none durante la animación de cierre para evitar
          inputs accidentales mientras colapsa. */}
      {isOpen && (
        <div style={{ pointerEvents: layers.getPointerEvents('base'), minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
          {view === 'chat'
            ? <ChatPanel isClosing={isClosing} />
            : <MemoryPanel isClosing={isClosing} />
          }
        </div>
      )}
      {/* Global toasts for short LLM status alerts */}
      <Toasts />
      {showModelSetup && <ModelSetupModal versionInfo={versionInfo} onClose={() => setShowModelSetup(false)} />}
      <ApprovalOverlay />
    </div>
  )
}

