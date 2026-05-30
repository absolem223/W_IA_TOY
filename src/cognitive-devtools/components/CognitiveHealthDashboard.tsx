import React, { useEffect, useState } from 'react'

export function CognitiveHealthDashboard(): React.ReactElement {
  const [metrics, setMetrics] = useState<any>({
    totalNodes: 0,
    persistentNodes: 0,
    archivalNodes: 0,
    totalEdges: 0,
    avgTrustScore: 0,
    avgUsageScore: 0
  })

  useEffect(() => {
    const fetchMetrics = async () => {
      if ((window as any).electronAPI?.devGetKnowledgeMetrics) {
        const data = await (window as any).electronAPI.devGetKnowledgeMetrics()
        setMetrics(data)
      }
    }
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="cdt-panel">
      <header className="cdt-panel__header">
        <h2>Knowledge Store Metrics</h2>
        <span>Runtime Observability</span>
      </header>
      
      {metrics.isDegraded && (
        <div style={{ background: '#4a1515', color: '#ffb3b3', padding: '12px', borderRadius: '4px', marginBottom: '12px', fontSize: '12px' }}>
          <strong>⚠️ NATIVE RUNTIME DEGRADED</strong>
          <br/>
          {metrics.degradedReason}
          <br/>
          <br/>
          Run <code>npm run rebuild</code> or <code>npm run doctor</code>
        </div>
      )}

      <div className="cdt-metric-grid">
        <Metric label="total nodes" value={metrics.totalNodes} />
        <Metric label="persistent nodes" value={metrics.persistentNodes} />
        <Metric label="archival nodes" value={metrics.archivalNodes} />
        <Metric label="total edges" value={metrics.totalEdges} />
        <Metric label="avg trust score" value={metrics.avgTrustScore} />
        <Metric label="avg usage score" value={metrics.avgUsageScore} />
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="cdt-metric">
      <span>{label}</span>
      <strong>{Math.round(value * 1000) / 1000}</strong>
    </div>
  )
}
