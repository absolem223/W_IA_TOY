import type { CapabilityGraphSnapshot, CapabilityNode } from './CapabilityGraph'
import type { CognitivePolicyConfig } from './CognitivePolicyLayer'

export interface ConstraintReport {
  limitations: string[]
  disabledModules: CapabilityNode[]
  offlineProviders: CapabilityNode[]
  privacyRestrictions: string[]
  unavailableCapabilities: CapabilityNode[]
}

export class ConstraintAwareness {
  report(input: {
    capabilityGraph: CapabilityGraphSnapshot
    policy?: CognitivePolicyConfig
  }): ConstraintReport {
    const disabledModules = input.capabilityGraph.nodes.filter(node => node.kind === 'module' && node.state !== 'enabled')
    const offlineProviders = input.capabilityGraph.nodes.filter(node => node.kind === 'provider' && node.connectivity === 'offline')
    const unavailableCapabilities = input.capabilityGraph.nodes.filter(node => node.state === 'disabled' || node.state === 'unavailable')
    return {
      limitations: input.capabilityGraph.nodes.flatMap(node => node.limitations).filter(unique),
      disabledModules,
      offlineProviders,
      privacyRestrictions: input.policy?.privacyBlockedTerms ?? ['password', 'token', 'api key', 'secreto', 'contraseña'],
      unavailableCapabilities,
    }
  }
}

function unique<T>(value: T, index: number, list: T[]): boolean {
  return list.indexOf(value) === index
}
