import React from 'react'
import { useCognitiveDevtoolsStore } from '../store/useCognitiveDevtoolsStore'

const EVENT_GROUPS = [
  'engram.activated',
  'reflection.generated',
  'engram.conflict_detected',
  'engram.consolidated',
  'engram.reinforced',
  'engram.degraded',
  'policy.applied',
  'simulation.turn',
]

export function EventStreamPanel(): React.ReactElement {
  const { events, filter, setFilter } = useCognitiveDevtoolsStore()
  const filtered = events.filter(event => {
    const queryMatch = filter.query.trim() === '' || JSON.stringify(event).toLowerCase().includes(filter.query.toLowerCase())
    const typeMatch = filter.eventTypes.length === 0 || filter.eventTypes.includes(event.type)
    return queryMatch && typeMatch
  })

  function toggleType(type: string): void {
    const next = filter.eventTypes.includes(type)
      ? filter.eventTypes.filter(item => item !== type)
      : [...filter.eventTypes, type]
    setFilter({ eventTypes: next })
  }

  return (
    <section className="cdt-panel">
      <header className="cdt-panel__header">
        <h2>Event Stream</h2>
        <input
          value={filter.query}
          onChange={event => setFilter({ query: event.target.value })}
          placeholder="filter events"
        />
      </header>
      <div className="cdt-filter-row">
        {EVENT_GROUPS.map(type => (
          <button
            key={type}
            type="button"
            className={filter.eventTypes.includes(type) ? 'is-active' : ''}
            onClick={() => toggleType(type)}
          >
            {type}
          </button>
        ))}
      </div>
      <div className="cdt-event-list">
        {filtered.map(event => (
          <article key={event.id} className="cdt-event">
            <div>
              <strong>{event.type}</strong>
              <time>{event.timestamp}</time>
            </div>
            <pre>{JSON.stringify(event.payload, null, 2)}</pre>
          </article>
        ))}
      </div>
    </section>
  )
}
