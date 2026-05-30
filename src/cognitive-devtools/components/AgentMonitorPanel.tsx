import React, { useEffect, useState } from 'react'

interface AgentEvent {
  recursion: number
  tools: Array<{
    id: string
    name: string
    argsBuffer: string
  }>
  timestamp: number
}

export function AgentMonitorPanel() {
  const [events, setEvents] = useState<AgentEvent[]>([])

  useEffect(() => {
    const off = window.electronAPI.onAgentLoop((data: any) => {
      setEvents(prev => [{ ...data, timestamp: Date.now() }, ...prev].slice(0, 50))
    })
    return off
  }, [])

  return (
    <div className="cdt-panel cdt-panel--agent">
      <div className="cdt-panel__header">
        <h3>Agent Monitor</h3>
        <div className="cdt-badge cdt-badge--purple">{events.length} Loops</div>
      </div>
      <div className="cdt-panel__content">
        {events.length === 0 ? (
          <div className="cdt-empty">Waiting for Agent Loop...</div>
        ) : (
          <div className="cdt-list">
            {events.map((ev, i) => (
              <div key={i} className="cdt-list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>Recursion {ev.recursion}</strong>
                  <span style={{ fontSize: '10px', color: '#888' }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#aaa' }}>
                  {ev.tools.map(t => (
                    <div key={t.id} style={{ background: '#1e1e1e', padding: '4px', borderRadius: '4px', marginTop: '2px' }}>
                      <span style={{ color: '#4CAF50' }}>{t.name}</span>
                      <pre style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {t.argsBuffer}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
