import React, { useEffect, useState } from 'react'

export function ApprovalOverlay() {
  const [request, setRequest] = useState<{ toolName: string, capabilities: string[] } | null>(null)

  useEffect(() => {
    const off = window.electronAPI.onToolApprovalRequested((data) => {
      setRequest(data)
    })
    return off
  }, [])

  if (!request) return null

  const handleApprove = () => {
    window.electronAPI.sendToolApprovalResponse(request.toolName, true)
    setRequest(null)
  }

  const handleDeny = () => {
    window.electronAPI.sendToolApprovalResponse(request.toolName, false)
    setRequest(null)
  }

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#1e1e1e', border: '1px solid #444', borderRadius: '12px',
        padding: '20px', width: '100%', maxWidth: '300px',
        display: 'flex', flexDirection: 'column', gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#fff', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
          Approval Required
        </h3>
        
        <div style={{ fontSize: '13px', color: '#ccc' }}>
          ArgOS is requesting permission to use: <br/>
          <strong style={{ color: '#61dafb' }}>{request.toolName}</strong>
        </div>

        <div style={{ fontSize: '11px', color: '#888', background: '#111', padding: '8px', borderRadius: '6px' }}>
          <strong>Required Capabilities:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {request.capabilities.map(cap => (
              <li key={cap} style={{ color: '#ffb86c' }}>{cap}</li>
            ))}
          </ul>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button 
            onClick={handleDeny}
            style={{
              flex: 1, padding: '8px', background: 'transparent', 
              color: '#ff5555', border: '1px solid #ff5555', borderRadius: '6px',
              cursor: 'pointer'
            }}>
            Deny
          </button>
          <button 
            onClick={handleApprove}
            style={{
              flex: 1, padding: '8px', background: '#4CAF50', 
              color: '#fff', border: 'none', borderRadius: '6px',
              cursor: 'pointer'
            }}>
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
