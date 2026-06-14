import React, { useEffect, useState } from 'react'

export function ModelSetupModal({ onClose }: { onClose: () => void }) {
  const [models, setModels] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const fetchModels = async () => {
      setLoading(true)
      try {
        const res = await fetch('http://localhost:1234/v1/models', { method: 'GET' })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = await res.json()
        const list = (data.data ?? []).map((m: any) => m.id)
        if (mounted) setModels(list)
      } catch (e: any) {
        if (mounted) setModels(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchModels()
    return () => { mounted = false }
  }, [])

  const handleStartLM = async () => {
    setStarting(true)
    try {
      await (window as any).electronAPI.startLMStudio()
      // After requesting start, poll for models
      const start = Date.now()
      while (Date.now() - start < 30000) {
        try {
          const res = await fetch('http://localhost:1234/v1/models')
          if (res.ok) {
            const data = await res.json()
            const list = (data.data ?? []).map((m: any) => m.id)
            setModels(list)
            return
          }
        } catch {}
        await new Promise(r => setTimeout(r, 2000))
      }
      setError('No se detectó LM Studio después de 30s')
    } finally {
      setStarting(false)
    }
  }

  const handleConfirm = async () => {
    const modelToSave = selected || (models && models[0])
    if (!modelToSave) {
      // Option to use OpenRouter free models
      // If user selects this, send empty modelId and let LLMManager handle fallback
      await (window as any).electronAPI.sendBiosSelection('')
      onClose()
      return
    }
    await (window as any).electronAPI.sendBiosSelection(modelToSave)
    onClose()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>⚙️ Configuración de ArgOS</h3>
        {loading && <p>Cargando modelos locales…</p>}
        {!loading && models && (
          <div className="model-list">
            {models.length === 0 && <p>No hay modelos cargados en LMStudio.</p>}
            {models.map(m => (
              <div key={m} className={`model-item ${selected === m ? 'selected' : ''}`} onClick={() => setSelected(m)}>
                {m}
              </div>
            ))}
          </div>
        )}
        {!loading && models === null && (
          <div>
            <p>No se pudo conectar a LMStudio en localhost:1234.</p>
            <button onClick={handleStartLM} disabled={starting}>{starting ? 'Iniciando LMStudio...' : 'Iniciar LMStudio'}</button>
            {error && <div style={{ color: 'var(--muted)', marginTop: 8 }}>{error}</div>}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <label>
            <input type="checkbox" onChange={(e) => {
              if (e.currentTarget.checked) setSelected('')
              else setSelected(null)
            }} /> Usar OpenRouter gratuito
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose}>Cancelar</button>
          <button onClick={handleConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}
