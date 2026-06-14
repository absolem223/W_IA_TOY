import { CapabilityGraph, type CapabilityGraphSnapshot, type CapabilityNode } from './CapabilityGraph'
import { ARGOS_FOUNDATIONAL_STATEMENT, ARGOS_SELF_MODEL, SelfAwarenessLayer } from '../shared/selfAwareness'

function getPackageVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../package.json') as { version?: string }
    return pkg.version ?? '3.2.0'
  } catch {
    return '3.2.0'
  }
}

export interface RuntimeAwareness {
  systemName: string
  mode: 'experimental-isolated' | 'shadow' | 'runtime-integrated'
  version: string
  deterministic: boolean
  runtimeIntegration: 'none' | 'read-only' | 'full'
}

export interface FeatureFlag {
  id: string
  enabled: boolean
  description: string
}

export interface DependencyAwareness {
  id: string
  kind: 'internal' | 'npm' | 'provider' | 'runtime'
  status: 'available' | 'missing' | 'disabled'
  notes: string
}

export interface SelfKnowledgeReport {
  runtime: RuntimeAwareness
  foundationalStatement: string
  selfAwareness: Record<SelfAwarenessLayer, string>
  capabilityGraph: CapabilityGraphSnapshot
  activeModules: CapabilityNode[]
  providers: CapabilityNode[]
  dependencies: DependencyAwareness[]
  featureFlags: FeatureFlag[]
}

export class SelfKnowledgeSubsystem {
  constructor(
    private runtime: RuntimeAwareness = {
      systemName: 'Argos Cognitive Core',
      mode: 'experimental-isolated',
      version: getPackageVersion(),
      deterministic: true,
      runtimeIntegration: 'none',
    },
    private graph: CapabilityGraph = CapabilityGraph.defaultExperimentalGraph(),
    private dependencies: DependencyAwareness[] = defaultDependencies(),
    private featureFlags: FeatureFlag[] = defaultFlags(),
  ) {}

  report(now = new Date()): SelfKnowledgeReport {
    const snapshot = this.graph.snapshot(now)
    return {
      runtime: { ...this.runtime },
      foundationalStatement: ARGOS_FOUNDATIONAL_STATEMENT,
      selfAwareness: { ...ARGOS_SELF_MODEL },
      capabilityGraph: snapshot,
      activeModules: snapshot.nodes.filter(node => node.kind === 'module' && node.state === 'enabled'),
      providers: snapshot.nodes.filter(node => node.kind === 'provider'),
      dependencies: this.dependencies.map(dep => ({ ...dep })),
      featureFlags: this.featureFlags.map(flag => ({ ...flag })),
    }
  }

  registerCapability(node: CapabilityNode): void {
    this.graph.register(node)
  }

  setFeatureFlag(id: string, enabled: boolean): void {
    const flag = this.featureFlags.find(item => item.id === id)
    if (flag) flag.enabled = enabled
  }
}

function defaultDependencies(): DependencyAwareness[] {
  return [
    { id: 'typescript', kind: 'npm', status: 'available', notes: 'Used for static typing and isolated cognitive tests.' },
    { id: 'electron-runtime', kind: 'runtime', status: 'disabled', notes: 'Intentionally not connected to the experimental core.' },
    { id: 'external-llm', kind: 'provider', status: 'disabled', notes: 'Shadow context only; no memory control or live model calls.' },
  ]
}

function defaultFlags(): FeatureFlag[] {
  return [
    { id: 'cognitive-core', enabled: true, description: 'Enable isolated engram lifecycle and activation.' },
    { id: 'metacognition', enabled: true, description: 'Enable reflection, consolidation, and graph analysis.' },
    { id: 'runtime-integration', enabled: false, description: 'Connect to assistant runtime. Disabled by design.' },
    { id: 'external-llm', enabled: false, description: 'Call external LLM providers. Disabled in experimental core.' },
  ]
}
