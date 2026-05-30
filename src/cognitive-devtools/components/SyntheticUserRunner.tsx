import React from 'react'
import { ScenarioRunner, SemanticGraphEngine, SyntheticUserFramework } from '../../cognitive'
import { useCognitiveDevtoolsStore } from '../store/useCognitiveDevtoolsStore'

export function SyntheticUserRunner(): React.ReactElement {
  const { setFrames, setEvents } = useCognitiveDevtoolsStore()

  function runSynthetic(): void {
    const framework = new SyntheticUserFramework()
    const profile = framework.createProfile('devtools_user', {
      precision: 0.88,
      volatility: 0.35,
      contradictionRate: 0.2,
      manipulationRate: 0.1,
      initiativeTolerance: 0.7,
    })
    const scenario = framework.toScenario(profile, {
      weeks: 2,
      turnsPerSession: 6,
      startAt: '2026-05-17T00:00:00.000Z',
    })
    const result = new ScenarioRunner().run(scenario)
    const graphEngine = new SemanticGraphEngine()
    setFrames(result.frames.map((frame, index) => ({
      frame,
      snapshot: result.snapshots[index],
      metrics: frame.metrics,
      graph: graphEngine.build(frame.engrams),
    })))
    setEvents(result.frames.flatMap(frame => frame.events))
  }

  return (
    <section className="cdt-panel">
      <header className="cdt-panel__header">
        <h2>Synthetic User Runner</h2>
      </header>
      <button type="button" onClick={runSynthetic}>Run deterministic synthetic profile</button>
    </section>
  )
}
