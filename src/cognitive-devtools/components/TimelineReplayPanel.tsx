import React from 'react'
import { useCognitiveDevtoolsStore } from '../store/useCognitiveDevtoolsStore'

export function TimelineReplayPanel(): React.ReactElement {
  const { frames, selectedFrameIndex, selectFrame } = useCognitiveDevtoolsStore()
  const current = frames[selectedFrameIndex]

  return (
    <section className="cdt-panel">
      <header className="cdt-panel__header">
        <h2>Timeline Replay</h2>
        <span>{selectedFrameIndex + 1}/{frames.length}</span>
      </header>
      <input
        type="range"
        min={0}
        max={Math.max(0, frames.length - 1)}
        value={selectedFrameIndex}
        onChange={event => selectFrame(Number(event.target.value))}
      />
      <div className="cdt-controls">
        <button type="button" onClick={() => selectFrame(selectedFrameIndex - 1)}>Prev</button>
        <button type="button" onClick={() => selectFrame(selectedFrameIndex + 1)}>Next</button>
      </div>
      {current ? (
        <pre>{JSON.stringify({
          frameId: current.frame.frameId,
          turn: current.frame.turn,
          active: current.frame.activated.map(item => item.engram.id),
          snapshot: current.snapshot.frameId,
        }, null, 2)}</pre>
      ) : <p>No replay frames loaded.</p>}
    </section>
  )
}
