import React from 'react'
import { useCognitiveDevtoolsStore } from '../store/useCognitiveDevtoolsStore'

export function ActiveEngramsInspector(): React.ReactElement {
  const { frames, selectedFrameIndex } = useCognitiveDevtoolsStore()
  const current = frames[selectedFrameIndex]
  const active = current?.frame.activated ?? []

  return (
    <section className="cdt-panel">
      <header className="cdt-panel__header">
        <h2>Active Engrams</h2>
        <span>{active.length} active</span>
      </header>
      <div className="cdt-table-wrap">
        <table className="cdt-table">
          <thead>
            <tr>
              <th>id</th>
              <th>kind</th>
              <th>score</th>
              <th>confidence</th>
              <th>decay</th>
              <th>reinforcement</th>
              <th>contradiction</th>
              <th>links</th>
              <th>updated</th>
            </tr>
          </thead>
          <tbody>
            {active.map(item => (
              <tr key={item.engram.id}>
                <td>{item.engram.id}</td>
                <td>{item.engram.memoryKind}</td>
                <td>{round(item.score)}</td>
                <td>{round(item.engram.confidence)}</td>
                <td>{round(item.engram.decayRate)}</td>
                <td>{item.engram.reinforcementCount}</td>
                <td>{round(item.engram.contradictionScore)}</td>
                <td>{item.engram.conflictsWith.join(', ') || '-'}</td>
                <td>{item.engram.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
