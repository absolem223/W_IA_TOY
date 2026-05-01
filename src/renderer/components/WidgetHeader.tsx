import React from 'react'

interface Props {
  isOpen:   boolean
  onToggle: () => void
}

export function WidgetHeader({ isOpen, onToggle }: Props): React.ReactElement {
  return (
    // This entire bar is the native drag region.
    // Buttons inside use .no-drag to opt out.
    <header className="widget-header">
      <div className="widget-header__brand">
        <span className="widget-header__dot" aria-hidden="true" />
        <span className="widget-header__title">Widget IA</span>
      </div>

      <button
        id="widget-toggle"
        className="widget-toggle no-drag"
        onClick={onToggle}
        aria-label={isOpen ? 'Cerrar chat' : 'Abrir chat'}
      >
        {isOpen ? '✕' : '✦'}
      </button>
    </header>
  )
}
