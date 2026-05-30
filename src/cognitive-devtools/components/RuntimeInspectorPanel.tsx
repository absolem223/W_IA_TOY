import React, { useEffect, useState } from 'react'
import type { RuntimeStatusReport } from '../../shared/runtime'

interface ContextObservabilityMetrics {
  globalPressure: number
  runtimeIntrospectionSize: number
  memoryInjectionCount: number
  focusWindowSize: number
  layerUtilization: Record<string, number>
  pressureWarnings: string[]
  skippedLayers: string[]
  compressionApplied: Record<string, number>
}

export function RuntimeInspectorPanel(): React.ReactElement {
  const [status, setStatus] = useState<RuntimeStatusReport | null>(null)
  const [observability, setObservability] = useState<ContextObservabilityMetrics | null>(null)
  const [preview, setPreview] = useState<string>('')

  useEffect(() => {
    window.electronAPI.getRuntimeStatus().then(setStatus).catch(() => {})
    const offStatus = window.electronAPI.onRuntimeStatus((payload) => setStatus(payload))
    const offObservability = window.electronAPI.onContextObservability((payload) => setObservability(payload))
    const offPreview = window.electronAPI.onPromptPreview((payload) => setPreview(payload))
    return () => {
      offStatus()
      offObservability()
      offPreview()
    }
  }, [])

  return (
    <section className="cdt-panel">
      <header className="cdt-panel__header">
        <h2>Runtime Inspector</h2>
        <span>{status?.fallbackActive ? 'fallback' : 'primario'}</span>
      </header>

      <div className="cdt-metric-grid">
        <div className="cdt-metric"><span>Modelo activo</span><strong>{status?.activeModel ?? 'ninguno'}</strong></div>
        <div className="cdt-metric"><span>Proveedor</span><strong>{status?.inferenceProvider ?? '—'}</strong></div>
        <div className="cdt-metric"><span>Presión</span><strong>{observability?.globalPressure ?? 0}%</strong></div>
        <div className="cdt-metric"><span>Memoria inyectada</span><strong>{observability?.memoryInjectionCount ?? 0}</strong></div>
        <div className="cdt-metric"><span>Introspección</span><strong>{observability?.runtimeIntrospectionSize ?? 0} chars</strong></div>
        <div className="cdt-metric"><span>Focus window</span><strong>{observability?.focusWindowSize ?? 0} chars</strong></div>
      </div>

      <div className="cdt-panel__body" style={{ marginTop: 10 }}>
        <h3>Skipped layers</h3>
        <p>{observability?.skippedLayers.length ? observability.skippedLayers.join(', ') : 'ninguno'}</p>
        <h3>Compression</h3>
        <pre>{observability ? JSON.stringify(observability.compressionApplied, null, 2) : 'cargando...'}</pre>
      </div>

      {preview && (
        <div className="cdt-panel__body" style={{ marginTop: 10 }}>
          <h3>System prompt preview</h3>
          <pre>{preview}</pre>
        </div>
      )}
    </section>
  )
}
