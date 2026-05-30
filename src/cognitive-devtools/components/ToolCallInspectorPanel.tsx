import React, { useEffect, useState } from 'react'

export function ToolCallInspectorPanel(): React.ReactElement {
  const [loops, setLoops] = useState<any[]>([])

  useEffect(() => {
    if ((window as any).electronAPI?.onAgentLoop) {
      const unsub = (window as any).electronAPI.onAgentLoop((data: any) => {
        setLoops(prev => [data, ...prev].slice(0, 5))
      })
      return () => unsub()
    }
  }, [])

  if (loops.length === 0) {
    return (
      <section className="cdt-panel">
        <header className="cdt-panel__header">
          <h2>Tool Call Inspector</h2>
          <span>No tool calls yet</span>
        </header>
        <div style={{ padding: '12px', fontSize: '11px', color: '#666' }}>
          Waiting for agent loops...
        </div>
      </section>
    )
  }

  return (
    <section className="cdt-panel">
      <header className="cdt-panel__header">
        <h2>Tool Call Inspector</h2>
        <span>Active & Recent Executions</span>
      </header>
      
      <div className="cdt-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {loops.map((loop, idx) => (
          <div key={idx} style={{ marginBottom: '8px', padding: '8px', background: '#1c1c1c', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888', marginBottom: '4px' }}>
              <strong>Recursion: {loop.recursion}</strong>
              <span>State: {loop.state}</span>
            </div>
            
            {loop.tools && loop.tools.map((tc: any, tIdx: number) => (
              <div key={tIdx} style={{ background: '#222', padding: '8px', marginTop: '4px', borderLeft: '2px solid #5a5', fontFamily: 'monospace', fontSize: '10px', wordBreak: 'break-all' }}>
                <div style={{ color: '#5a5', fontWeight: 'bold' }}>{tc.name}</div>
                <div style={{ color: '#aaa', marginTop: '4px' }}>Arguments:</div>
                <div style={{ color: '#ddd' }}>{tc.argsBuffer}</div>
              </div>
            ))}
            
            {(!loop.tools || loop.tools.length === 0) && (
              <div style={{ color: '#888', fontStyle: 'italic', fontSize: '10px' }}>No tools generated in this recursion.</div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
