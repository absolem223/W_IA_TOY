import React, { useState } from 'react'

interface MemoryUsedItem {
  source: string
  label: string
}

interface Props {
  items: MemoryUsedItem[]
  onFeedback?: (useful: boolean) => void
}

/**
 * Collapsible indicator showing which memories were injected into the prompt.
 * Appears above the assistant's response when memory context was used.
 */
export function MemoryUsageIndicator({ items, onFeedback }: Props): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null

  return (
    <div className="memory-usage">
      <button
        className="memory-usage__toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="memory-usage__icon">🧠</span>
        <span className="memory-usage__label">
          {items.length} {items.length === 1 ? 'memory' : 'memories'} used
        </span>
        <span className="memory-usage__chevron">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="memory-usage__details">
          {items.map((item, i) => (
            <div key={`${item.source}-${i}`} className="memory-usage__item">
              <span className="memory-usage__source">[{item.source}]</span>
              <span className="memory-usage__text">{item.label}</span>
            </div>
          ))}
          {onFeedback && (
            <div className="memory-usage__feedback">
              <span>Was this useful?</span>
              <button className="memory-btn memory-btn--small" onClick={() => onFeedback(true)} title="Useful">👍</button>
              <button className="memory-btn memory-btn--small" onClick={() => onFeedback(false)} title="Not useful">👎</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
