import React, { useState, useEffect, useCallback } from 'react'

interface Props {
  isOpen:   boolean
  onToggle: () => void
  onMemoryToggle?: () => void
  memoryActive?: boolean
}

export function WidgetHeader({ isOpen, onToggle, onMemoryToggle, memoryActive }: Props): React.ReactElement {
  const [tick, setTick] = useState(0);
  const [chatState, setChatState] = useState<'idle' | 'thinking' | 'streaming' | 'error'>('idle');

  const triggerBreath = useCallback(() => {
    if (!isOpen) setTick(t => t + 1);
  }, [isOpen]);

  useEffect(() => {
    // Escuchar el flujo del chat para actualizar la semántica del indicador
    // El requestId se ignora aquí: el dot refleja estado global del sistema, no de un request específico
    const offStart = window.electronAPI.onStart(() => setChatState('thinking'));
    const offToken = window.electronAPI.onToken(() => setChatState('streaming'));
    const offAbort = window.electronAPI.onAbort(() => setChatState('error'));
    const offError = window.electronAPI.onError(() => setChatState('error'));
    
    const offDone = window.electronAPI.onDone(() => {
      setTimeout(() => setChatState('idle'), 600);
      triggerBreath();
    });

    return () => {
      offStart();
      offToken();
      offAbort();
      offError();
      offDone();
    };
  }, [triggerBreath]);

  useEffect(() => {
    if (isOpen) return;

    // Disparar un respiro inmediatamente al cerrar el panel
    triggerBreath();

    // Timer de inactividad: dispara el respiro cada 15 segundos.
    // Como la animación dura 12s (6s x 2 repeticiones),
    // el usuario percibirá una pausa natural de 3s entre ciclos.
    const idleTimer = setInterval(triggerBreath, 15000);

    return () => clearInterval(idleTimer);
  }, [isOpen, triggerBreath]);

  // Alternamos entre dos clases idénticas para forzar el reinicio
  // de la animación CSS sin tener que desmontar/remontar el DOM node
  const pulseClass = !isOpen 
    ? (tick % 2 === 0 ? 'widget-header--pulse-a' : 'widget-header--pulse-b') 
    : '';

  return (
    // This entire bar is the native drag region.
    // Buttons inside use .no-drag to opt out.
    <header className={`widget-header ${!isOpen ? 'widget-header--idle' : ''} ${pulseClass}`}>
      <div className="widget-header__brand">
        <span className={`widget-header__dot widget-header__dot--${chatState}`} aria-hidden="true" />
        <span className="widget-header__title">Argos</span>
      </div>

      <div className="widget-header__actions">
        {isOpen && onMemoryToggle && (
          <button
            className={`widget-header__memory-btn no-drag${memoryActive ? ' widget-header__memory-btn--active' : ''}`}
            onClick={onMemoryToggle}
            aria-label={memoryActive ? 'Show chat' : 'Show memory'}
            title={memoryActive ? 'Show chat' : 'Show memory'}
          >
            🧠
          </button>
        )}
        {isOpen && (
          <button
            className="widget-header__devtools-btn no-drag"
            onClick={() => window.electronAPI.openDevtools()}
            aria-label="Abrir DevTools"
            title="Abrir DevTools"
          >
            🛠️
          </button>
        )}
        <button
          className="widget-toggle no-drag"
          onClick={() => {
            if (window.confirm('¿Seguro que querés cerrar el asistente?')) {
              window.electronAPI.quitApp();
            }
          }}
          aria-label="Cerrar aplicación"
          title="Cerrar aplicación"
        >
          ✕
        </button>
        <button
          id="widget-toggle"
          className="widget-toggle no-drag"
          onClick={onToggle}
          aria-label={isOpen ? 'Contraer chat' : 'Expandir chat'}
          title={isOpen ? 'Contraer chat' : 'Expandir chat'}
        >
          {isOpen ? '−' : '✦'}
        </button>
      </div>
    </header>
  )
}
