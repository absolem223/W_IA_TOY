export type CapabilityState = 'enabled' | 'disabled' | 'degraded' | 'unavailable'
export type ConnectivityState = 'online' | 'offline' | 'local-only' | 'unknown'
export type PermissionState = 'granted' | 'denied' | 'requires-confirmation' | 'not-applicable'

export interface CapabilityNode {
  id: string
  label: string
  kind: 'module' | 'tool' | 'provider' | 'capability' | 'policy' | 'constraint'
  state: CapabilityState
  connectivity: ConnectivityState
  permission: PermissionState
  description: string
  limitations: string[]
}

export interface CapabilityEdge {
  from: string
  to: string
  relation: 'depends-on' | 'provides' | 'restricts' | 'observes' | 'feeds'
}

export interface CapabilityGraphSnapshot {
  generatedAt: string
  nodes: CapabilityNode[]
  edges: CapabilityEdge[]
}

export class CapabilityGraph {
  private nodes = new Map<string, CapabilityNode>()
  private edges: CapabilityEdge[] = []

  register(node: CapabilityNode): void {
    this.nodes.set(node.id, { ...node, limitations: [...node.limitations] })
  }

  link(edge: CapabilityEdge): void {
    this.edges.push(edge)
  }

  snapshot(generatedAt = new Date()): CapabilityGraphSnapshot {
    return {
      generatedAt: generatedAt.toISOString(),
      nodes: [...this.nodes.values()].map(node => ({ ...node, limitations: [...node.limitations] })),
      edges: [...this.edges],
    }
  }

  unavailableCapabilities(): CapabilityNode[] {
    return [...this.nodes.values()].filter(node => node.state === 'disabled' || node.state === 'unavailable' || node.connectivity === 'offline')
  }

  static defaultExperimentalGraph(): CapabilityGraph {
    const graph = new CapabilityGraph()
    graph.register({
      id: 'engram-core',
      label: 'Minimum Cognitive Core',
      kind: 'module',
      state: 'enabled',
      connectivity: 'local-only',
      permission: 'not-applicable',
      description: 'Local experimental engram creation, activation, reinforcement, decay, and behavior adaptation.',
      limitations: ['not connected to Electron runtime', 'not persisted to production memory'],
    })
    graph.register({
      id: 'reflection-engine',
      label: 'Reflection Engine',
      kind: 'module',
      state: 'enabled',
      connectivity: 'local-only',
      permission: 'not-applicable',
      description: 'Generates internal hypotheses and cognitive summaries from simulation frames.',
      limitations: ['heuristic only', 'does not call external models'],
    })
    graph.register({
      id: 'hash-embedding-provider',
      label: 'Hash Embedding Provider',
      kind: 'provider',
      state: 'enabled',
      connectivity: 'local-only',
      permission: 'not-applicable',
      description: 'Deterministic local bag-of-token embedding provider used for repeatable tests.',
      limitations: ['low semantic fidelity', 'not a neural embedding model'],
    })
    graph.register({
      id: 'shadow-llm-adapter',
      label: 'Shadow LLM Adapter',
      kind: 'provider',
      state: 'degraded',
      connectivity: 'offline',
      permission: 'requires-confirmation',
      description: 'Builds context packets for future LLM tests without allowing memory writes.',
      limitations: ['no real LLM invocation in isolated core'],
    })
    graph.link({ from: 'engram-core', to: 'hash-embedding-provider', relation: 'depends-on' })
    graph.link({ from: 'reflection-engine', to: 'engram-core', relation: 'observes' })
    graph.link({ from: 'shadow-llm-adapter', to: 'engram-core', relation: 'feeds' })
    return graph
  }
}
