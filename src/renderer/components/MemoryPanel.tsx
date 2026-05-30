import React, { useState, useEffect, useCallback } from 'react'

interface ProfileEntry {
  value: string | string[]
  confidence: string
  source: string
  updatedAt: string
}

interface VaultEntry {
  id: string
  title: string
  tags: string[]
  trigger: string
  createdAt: string
}

interface MemoryStatus {
  initialized: boolean
  migrated: boolean
  turnCount: number
  vaultCount: number
  profileKeys: number
}

interface AssistantProfile {
  assistant_name?: string
  assistant_role?: string
  speaking_style?: string
}

interface Props {
  isClosing?: boolean
}

export function MemoryPanel({ isClosing = false }: Props): React.ReactElement {
  const [status, setStatus] = useState<MemoryStatus | null>(null)
  const [profile, setProfile] = useState<Record<string, ProfileEntry>>({})
  const [assistant, setAssistant] = useState<AssistantProfile>({})
  const [vault, setVault] = useState<VaultEntry[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [s, p, v] = await Promise.all([
        window.electronAPI.memoryGetStatus(),
        window.electronAPI.memoryGetProfile(),
        window.electronAPI.memoryGetVault(),
      ])
      setStatus(s)
      setProfile((p.profile || {}) as Record<string, ProfileEntry>)
      setAssistant((p as any).assistant || {})
      setVault(v)
    } catch (err) {
      console.error('[MemoryPanel] Failed to load:', err)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const offSaved = window.electronAPI.onMemorySaved(() => refresh())
    const offSync = window.electronAPI.onMemorySync(() => refresh())
    return () => { offSaved(); offSync(); }
  }, [refresh])

  const handleDelete = async (id: string) => {
    await window.electronAPI.memoryDelete(id)
    refresh()
  }

  const handleEditStart = (key: string, entry: ProfileEntry) => {
    setEditingKey(key)
    setEditValue(Array.isArray(entry.value) ? entry.value.join(', ') : entry.value)
  }

  const handleEditSave = async () => {
    if (!editingKey) return
    await window.electronAPI.memoryUpdateProfile(editingKey, editValue)
    setEditingKey(null)
    setEditValue('')
    refresh()
  }

  const handleEditCancel = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className={`memory-panel no-drag${isClosing ? ' chat-panel--closing' : ''}`}>
      {/* Header */}
      <div className="memory-panel__header">
        <span className="memory-panel__title">🧠 Memory</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {status && (
            <span className="memory-panel__stats">
              {status.profileKeys}P · {status.vaultCount}V · {status.turnCount}T
            </span>
          )}
          <button
            className="memory-btn memory-btn--small"
            onClick={refresh}
            title="Sincronizar estado"
            style={{ opacity: 0.6, fontSize: '10px' }}
          >↺</button>
        </div>
      </div>

      <div className="memory-panel__content">
        {/* Identidad del asistente — siempre visible para reflejar el estado de runtime */}
        <section className="memory-section">
          <h3 className="memory-section__title">Argos Identity</h3>
          <div className="memory-entry">
            <span className="memory-entry__key">nombre activo</span>
            <span className="memory-entry__value" style={{ fontStyle: assistant.assistant_name ? 'normal' : 'italic', opacity: assistant.assistant_name ? 1 : 0.5 }}>
              {assistant.assistant_name || 'Argos (default)'}
            </span>
            {assistant.speaking_style && (
              <span className="memory-entry__badge memory-entry__badge--high" style={{ opacity: 0.7 }}>{assistant.speaking_style}</span>
            )}
          </div>
        </section>

        {/* Profile section */}
        <section className="memory-section">
          <h3 className="memory-section__title">Profile</h3>
          {(() => {
            const active     = Object.entries(profile).filter(([k]) => !k.startsWith('deprecated__'))
            const deprecated = Object.entries(profile).filter(([k]) =>  k.startsWith('deprecated__'))
            return (
              <>
                {active.length === 0 && (
                  <p className="memory-empty">{deprecated.length > 0 ? 'No active entries' : 'No profile entries yet'}</p>
                )}
                {active.map(([key, entry]) => (
                  <div key={key} className="memory-entry">
                    {editingKey === key ? (
                      <div className="memory-entry__edit">
                        <input
                          className="memory-entry__input"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') handleEditCancel() }}
                          autoFocus
                        />
                        <button className="memory-btn memory-btn--small" onClick={handleEditSave}>✓</button>
                        <button className="memory-btn memory-btn--small" onClick={handleEditCancel}>✕</button>
                      </div>
                    ) : (
                      <>
                        <span className="memory-entry__key">{key.replace(/_/g, ' ')}</span>
                        <span className="memory-entry__value">
                          {Array.isArray(entry.value) ? entry.value.join(', ') : entry.value}
                        </span>
                        <span className={`memory-entry__badge memory-entry__badge--${entry.confidence}`}>
                          {entry.confidence}
                        </span>
                        <div className="memory-entry__actions">
                          <button className="memory-btn memory-btn--small" onClick={() => handleEditStart(key, entry)} title="Edit">✎</button>
                          <button className="memory-btn memory-btn--small" onClick={() => handleCopy(String(entry.value))} title="Copy">⎘</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {deprecated.length > 0 && (
                  <p className="memory-empty" style={{ marginTop: 6, fontSize: 10, opacity: 0.4 }}>
                    {deprecated.length} entrada{deprecated.length > 1 ? 's' : ''} deprecada{deprecated.length > 1 ? 's' : ''} (reconciliadas)
                  </p>
                )}
              </>
            )
          })()}
        </section>

        {/* Vault section */}
        <section className="memory-section">
          <h3 className="memory-section__title">Vault ({vault.length})</h3>
          {vault.length === 0 && (
            <p className="memory-empty">No saved memories</p>
          )}
          {vault.map(entry => (
            <div key={entry.id} className="memory-entry">
              <span className="memory-entry__key">{entry.title}</span>
              <span className="memory-entry__tags">
                {entry.tags.map(t => <span key={t} className="memory-tag">{t}</span>)}
              </span>
              <div className="memory-entry__actions">
                <button className="memory-btn memory-btn--small" onClick={() => handleCopy(entry.title)} title="Copy">⎘</button>
                <button className="memory-btn memory-btn--small memory-btn--danger" onClick={() => handleDelete(entry.id)} title="Delete">🗑</button>
              </div>
            </div>
          ))}
        </section>

        {/* Status section */}
        {status && (
          <section className="memory-section memory-section--status">
            <h3 className="memory-section__title">System</h3>
            <div className="memory-status-grid">
              <span>Initialized</span><span>{status.initialized ? '✓' : '✕'}</span>
              <span>Migrated</span><span>{status.migrated ? '✓' : '—'}</span>
              <span>Session turns</span><span>{status.turnCount}</span>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
