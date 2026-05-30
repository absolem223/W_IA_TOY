import React from 'react'
import { ActiveEngramsInspector } from './components/ActiveEngramsInspector'
import { CognitiveHealthDashboard } from './components/CognitiveHealthDashboard'
import { AgentMonitorPanel } from './components/AgentMonitorPanel'
import { DecisionExplorer } from './components/DecisionExplorer'
import { EventStreamPanel } from './components/EventStreamPanel'
import { ProviderStatusPanel } from './components/ProviderStatusPanel'
import { RuntimeInspectorPanel } from './components/RuntimeInspectorPanel'
import { SemanticGraphViewer } from './components/SemanticGraphViewer'
import { SyntheticUserRunner } from './components/SyntheticUserRunner'
import { TimelineReplayPanel } from './components/TimelineReplayPanel'
import { ContextAssemblyInspector } from './components/ContextAssemblyInspector'
import { ToolCallInspectorPanel } from './components/ToolCallInspectorPanel'
import './devtools.css'

export function CognitiveDevToolsConsole(): React.ReactElement {
  return (
    <main className="cdt-root">
      <header className="cdt-topbar">
        <h1>Cognitive DevTools</h1>
        <span>experimental isolated console</span>
      </header>
      <div className="cdt-layout">
        <div className="cdt-column">
          <SyntheticUserRunner />
          <AgentMonitorPanel />
          <TimelineReplayPanel />
          <EventStreamPanel />
        </div>
        <div className="cdt-column cdt-column--wide">
          <SemanticGraphViewer />
          <ContextAssemblyInspector />
        </div>
        <div className="cdt-column">
          <RuntimeInspectorPanel />
          <ProviderStatusPanel />
          <CognitiveHealthDashboard />
          <ToolCallInspectorPanel />
        </div>
      </div>
    </main>
  )
}
