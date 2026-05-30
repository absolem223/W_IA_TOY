import React, { useEffect, useState } from 'react'

export function ContextAssemblyInspector(): React.ReactElement {
  const [traces, setTraces] = useState<any[]>([])

  useEffect(() => {
    if ((window as any).electronAPI?.onContextAssemblyTrace) {
      const unsub = (window as any).electronAPI.onContextAssemblyTrace((trace: any) => {
        setTraces(prev => [trace, ...prev].slice(0, 10)) // Keep last 10
      })
      return () => unsub()
    }
  }, [])

  return (
    <section className="cdt-panel">
      <header className="cdt-panel__header">
        <h2>Context Assembly Inspector</h2>
        <span>{traces.length} recent queries</span>
      </header>
      <div className="cdt-event-list">
        {traces.map((trace, idx) => (
          <article key={idx} className="cdt-event" style={{ borderLeft: '3px solid #61dafb' }}>
            <div style={{ marginBottom: 8 }}>
              <strong>Query: </strong> "{trace.query}" <span style={{ color: '#aaa', fontSize: 10 }}>({trace.strategy})</span>
            </div>
            <div style={{ fontSize: 11, marginBottom: 8 }}>
              Candidates: <strong>{trace.rawCandidatesCount}</strong> → Final Injected: <strong>{trace.finalContextCount}</strong>
            </div>
            {trace.topScores && trace.topScores.length > 0 && (
              <div style={{ fontSize: 10, background: '#222', padding: 4, borderRadius: 4 }}>
                <strong>Top Chunk Scores:</strong>
                {trace.topScores.map((s: any, i: number) => (
                  <div key={i}>{s.id.split('-').slice(0,2).join('-')} = <span style={{color: '#ffb86c'}}>{s.score}</span></div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
