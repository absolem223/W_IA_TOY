import React, { useEffect, useState } from 'react'
import type { ProviderStatus, RuntimeStatusReport } from '../../shared/runtime'

const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) return 'nunca'
  return new Date(timestamp).toLocaleString()
}

const renderBadge = (value: boolean | string | null) => {
  const text = value === true ? 'sí' : value === false ? 'no' : value || 'n/a'
  const color = value === true ? '#16a34a' : value === false ? '#dc2626' : '#444'
  return <strong style={{ color }}>{text}</strong>
}

export function ProviderStatusPanel(): React.ReactElement {
  const [status, setStatus] = useState<RuntimeStatusReport | null>(null)

  useEffect(() => {
    window.electronAPI.getRuntimeStatus().then(setStatus).catch(console.error)
    const remove = window.electronAPI.onRuntimeStatus((payload) => setStatus(payload))
    return remove
  }, [])

  if (!status) {
    return (
      <section className="cdt-panel">
        <header className="cdt-panel__header">
          <h2>Provider Status</h2>
          <span>cargando...</span>
        </header>
        <p>Consultando el estado del runtime...</p>
      </section>
    )
  }

  return (
    <section className="cdt-panel">
      <header className="cdt-panel__header">
        <h2>Provider Status</h2>
        <span>{status.authState === 'valid' ? 'autenticado' : 'sin auth'}</span>
      </header>
      <div className="cdt-metric-grid">
        <div className="cdt-metric">
          <span>Provider de inferencia</span>
          <strong>{status.inferenceProvider}</strong>
        </div>
        <div className="cdt-metric">
          <span>Provider de embeddings</span>
          <strong>{status.embeddingProvider}</strong>
        </div>
        <div className="cdt-metric">
          <span>Última respuesta</span>
          <strong>{formatTimestamp(status.lastSuccessfulRequestAt)}</strong>
        </div>
        <div className="cdt-metric">
          <span>Requests fallidos</span>
          <strong>{status.failedRequests}</strong>
        </div>
        <div className="cdt-metric">
          <span>Fallback activo</span>
          <strong>{status.fallbackActive ? 'sí' : 'no'}</strong>
        </div>
        <div className="cdt-metric">
          <span>Modelo activo</span>
          <strong>{status.activeModel ?? 'ninguno'}</strong>
        </div>
        <div className="cdt-metric">
          <span>Tokens estimados</span>
          <strong>{status.tokenUsageEstimate}</strong>
        </div>
        <div className="cdt-metric">
          <span>Errores recientes</span>
          <strong>{status.providerErrors.length}</strong>
        </div>
      </div>

      <div className="cdt-table-wrap" style={{ marginTop: 12 }}>
        <table className="cdt-table">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Tipo</th>
              <th>Online</th>
              <th>Auth</th>
              <th>Latencia</th>
              <th>Fallos</th>
              <th>Modelo</th>
            </tr>
          </thead>
          <tbody>
            {status.providers.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.label}</td>
                <td>{provider.category}</td>
                <td>{renderBadge(provider.online)}</td>
                <td>{renderBadge(provider.authState === 'valid')}</td>
                <td>{provider.lastLatencyMs !== null ? `${provider.lastLatencyMs}ms` : '—'}</td>
                <td>{provider.failureCount}</td>
                <td>{provider.modelRouting ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status.environmentWarnings.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h3>Advertencias de configuración</h3>
          <ul>
            {status.environmentWarnings.map((warning) => (
              <li key={warning.id}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
