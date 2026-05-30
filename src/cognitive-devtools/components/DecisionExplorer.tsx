import React from 'react'
import { DecisionExplanationLayer } from '../../cognitive'
import { useCognitiveDevtoolsStore } from '../store/useCognitiveDevtoolsStore'

const explainer = new DecisionExplanationLayer()

export function DecisionExplorer(): React.ReactElement {
  const { frames, selectedFrameIndex } = useCognitiveDevtoolsStore()
  const current = frames[selectedFrameIndex]
  const decision = current?.decision ?? (current ? explainer.explain({ frame: current.frame }) : null)

  return (
    <section className="cdt-panel">
      <header className="cdt-panel__header">
        <h2>Decision Explorer</h2>
        <span>{decision?.frameId ?? 'no frame'}</span>
      </header>
      {decision ? (
        <div className="cdt-stack">
          <Block title="Systems" items={decision.participatingSystems} />
          <Block title="Policies" items={decision.policyInfluence} />
          <Block title="Reflections" items={decision.reflectionInfluence} />
          <Block title="Behavior Effects" items={decision.behaviorEffects} />
          <div>
            <h3>Confidence Chain</h3>
            <pre>{JSON.stringify(decision.confidenceByInference, null, 2)}</pre>
          </div>
          <div>
            <h3>Activated Memories</h3>
            <pre>{JSON.stringify(decision.activatedMemories, null, 2)}</pre>
          </div>
        </div>
      ) : <p>No selected frame.</p>}
    </section>
  )
}

function Block({ title, items }: { title: string; items: string[] }): React.ReactElement {
  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {items.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}
