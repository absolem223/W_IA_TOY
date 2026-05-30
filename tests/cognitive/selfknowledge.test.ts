import assert from 'assert'
import {
  CapabilityGraph,
  CognitiveStateReporter,
  ConstraintAwareness,
  DecisionExplanationLayer,
  DynamicArchitectureDescription,
  ReflectionEngine,
  ScenarioRunner,
  SelfKnowledgeSubsystem,
  type CognitiveScenario,
} from '../../src/cognitive'

const scenario: CognitiveScenario = {
  id: 'selfknowledge_scenario',
  users: [
    {
      id: 'u_self',
      seedEngrams: [
        {
          type: 'behavioral_pattern',
          memoryKind: 'behavioral',
          content: 'El usuario quiere introspeccion tecnica precisa del sistema cognitivo',
          confidence: 0.86,
          emotionalWeight: 0.25,
          behavioralEffects: ['increase_specificity', 'more_direct_tone'],
        },
        {
          type: 'relational_state',
          memoryKind: 'identity',
          content: 'Modo operacional tecnico sin antropomorfismo',
          confidence: 0.82,
          emotionalWeight: 0.1,
          behavioralEffects: ['more_direct_tone'],
        },
      ],
    },
  ],
  sessions: [
    {
      id: 's_self',
      userId: 'u_self',
      startAt: '2026-05-17T00:00:00.000Z',
      turns: [
        { role: 'user', text: 'Describi el sistema cognitivo activo y sus limitaciones tecnicas' },
        { role: 'user', text: 'Bien, explica que memorias participaron y con que confianza', skipMinutes: 5 },
      ],
    },
  ],
}

function testSelfKnowledgeAndConstraintAwareness(): void {
  const graph = CapabilityGraph.defaultExperimentalGraph()
  graph.register({
    id: 'disabled-ui',
    label: 'Final UI',
    kind: 'module',
    state: 'disabled',
    connectivity: 'unknown',
    permission: 'not-applicable',
    description: 'Final UI is intentionally disabled in cognitive research mode.',
    limitations: ['no frontend integration'],
  })
  const self = new SelfKnowledgeSubsystem(undefined, graph)
  const report = self.report(new Date('2026-05-17T00:00:00.000Z'))
  assert.equal(report.runtime.mode, 'experimental-isolated')
  assert.ok(report.activeModules.some(module => module.id === 'engram-core'))
  assert.ok(report.providers.some(provider => provider.id === 'hash-embedding-provider'))
  assert.equal(report.featureFlags.find(flag => flag.id === 'runtime-integration')?.enabled, false)

  const constraints = new ConstraintAwareness().report({ capabilityGraph: report.capabilityGraph })
  assert.ok(constraints.disabledModules.some(module => module.id === 'disabled-ui'))
  assert.ok(constraints.offlineProviders.some(provider => provider.id === 'shadow-llm-adapter'))
  assert.ok(constraints.privacyRestrictions.includes('token'))
}

function testStateReporterDecisionExplanationAndArchitectureDescription(): void {
  const runner = new ScenarioRunner()
  const result = runner.run(scenario)
  const reflections = [new ReflectionEngine().reflect(result.frames)]
  const state = new CognitiveStateReporter().report({
    frames: result.frames,
    reflections,
  })
  assert.ok(state.memoryStatistics.total >= 2)
  assert.ok(state.activeTraits.length >= 1)
  assert.ok(state.confidenceAverage > 0)
  assert.ok(state.reflectionSummaries.length === 1)

  const frame = result.frames.find(item => item.activated.length > 0)
  assert.ok(frame)
  const explanation = new DecisionExplanationLayer().explain({
    frame,
    policies: ['privacy-aware inference active', 'runtime integration disabled'],
    reflections,
  })
  assert.ok(explanation.participatingSystems.includes('ContextActivationEngine'))
  assert.ok(explanation.activatedMemories.length > 0)
  assert.ok(explanation.confidenceByInference[0].confidence > 0)
  assert.ok(explanation.policyInfluence.length === 2)

  const selfKnowledge = new SelfKnowledgeSubsystem().report()
  const constraints = new ConstraintAwareness().report({ capabilityGraph: selfKnowledge.capabilityGraph })
  const description = new DynamicArchitectureDescription().describe({
    selfKnowledge,
    state,
    constraints,
  })
  assert.equal(description.system, 'Argos Cognitive Core')
  assert.ok(description.cognitivePipeline.includes('context activation'))
  assert.ok(description.memoryFlow.includes('activation scoring'))
  assert.ok(description.providers.some(provider => provider.includes('Hash Embedding Provider')))
  assert.equal(description.currentState.traits, state.activeTraits.length)
}

const tests = [
  testSelfKnowledgeAndConstraintAwareness,
  testStateReporterDecisionExplanationAndArchitectureDescription,
]

for (const test of tests) {
  test()
  console.log(`ok - ${test.name}`)
}
