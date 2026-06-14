import React, { useEffect, useState } from 'react'
import type { RuntimeStatusReport } from '../../shared/runtime'

interface ContextObservabilityMetrics {
  globalPressure: number
  systemPromptSize: number
  messageHistorySize: number
  memoryInjectionCount: number
  runtimeIntrospectionSize: number
  focusWindowSize: number
  layerUtilization: Record<string, number>
  pressureWarnings: string[]
  pressureRecommendations: string[]
  skippedLayers: string[]
  compressionApplied: Record<string, number>
}

interface Props {
  usedMemories: Array<{ type: string; label: string; score: number }>
  activeTopic: string | null
}

export function DebugOverlay({ usedMemories, activeTopic }: Props): React.ReactElement {
  const [isVisible, setIsVisible] = useState(false)
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusReport | null>(null)
  const [observability, setObservability] = useState<ContextObservabilityMetrics | null>(null)
  const [promptPreview, setPromptPreview] = useState<string>('')
  const [ttsState, setTtsState] = useState<string>('unknown')

  useEffect(() => {
    window.electronAPI.getRuntimeStatus().then(setRuntimeStatus).catch(() => {})

    const cleanupRuntime = window.electronAPI.onRuntimeStatus((payload) => setRuntimeStatus(payload))
    const cleanupContext = window.electronAPI.onContextObservability((metric) => setObservability(metric))
    const cleanupPrompt = window.electronAPI.onPromptPreview((preview) => setPromptPreview(preview))
    const cleanupVoiceState = window.electronAPI.onVoiceStateChanged((event) => setTtsState(event.state))
    const cleanupLLM = window.electronAPI.onLLMStatus((status) => {
      setRuntimeStatus((prev) => prev ? {
        ...prev,
        inferenceProvider: status.providerId,
        activeModel: status.modelId,
      } : {
        inferenceProvider: status.providerId,
        activeModel: status.modelId,
      } as any)
    })

    return () => {
      cleanupRuntime()
      cleanupContext()
      cleanupPrompt()
      cleanupVoiceState()
      cleanupLLM()
    }
  }, [])

  return (
    <div className={`debug-overlay ${isVisible ? 'debug-overlay--open' : ''}`}>
      <button
        className="debug-overlay__toggle no-drag"
        onClick={() => setIsVisible((prev) => !prev)}
        title={isVisible ? 'Ocultar panel debug' : 'Mostrar panel debug'}
      >
        {isVisible ? '⚡' : '🛠️'}
      </button>

      {isVisible && (
        <div className="debug-overlay__panel">
          <div className="debug-overlay__row">
            <span>Active model</span>
            <strong>{runtimeStatus?.activeModel ?? 'ninguno'}</strong>
          </div>
          <div className="debug-overlay__row">
            <span>Provider</span>
            <strong>{runtimeStatus?.inferenceProvider ?? '—'}</strong>
          </div>
          <div className="debug-overlay__row">
            <span>Fallback</span>
            <strong>{runtimeStatus?.fallbackActive ? 'sí' : 'no'}</strong>
          </div>
          <div className="debug-overlay__row">
            <span>Pressure</span>
            <strong>{observability?.globalPressure ?? 0}%</strong>
          </div>
          <div className="debug-overlay__row">
            <span>Memorias inyectadas</span>
            <strong>{usedMemories.length}</strong>
          </div>
          <div className="debug-overlay__row">
            <span>Topic activo</span>
            <strong>{activeTopic ?? 'ninguno'}</strong>
          </div>
          <div className="debug-overlay__row">
            <span>Tokens estimados</span>
            <strong>{runtimeStatus?.tokenUsageEstimate ?? 0}</strong>
          </div>
          <div className="debug-overlay__row debug-overlay__row--small">
            <span>Layers activos</span>
            <strong>{observability ? Object.keys(observability.layerUtilization).join(', ') : 'cargando...'}</strong>
          </div>
          {observability?.skippedLayers.length ? (
            <div className="debug-overlay__note">Skipped: {observability.skippedLayers.join('; ')}</div>
          ) : null}
          {promptPreview ? (
            <div className="debug-overlay__preview">
              <strong>System prompt preview</strong>
              <pre>{promptPreview}</pre>
            </div>
          ) : null}
          <div className="debug-overlay__footer">
            <span>Voice state: {ttsState}</span>
          </div>
        </div>
      )}
    </div>
  )
}
