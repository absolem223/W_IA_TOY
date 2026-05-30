import assert from 'assert'
import {
  AdvancedCognitiveMetrics,
  CognitiveEventBus,
  CognitivePolicyLayer,
  EngramStore,
  LongitudinalSimulationSuite,
  MemoryConsolidationSystem,
  ReflectionEngine,
  ScenarioRunner,
  SemanticGraphEngine,
  ShadowLLMAdapter,
  type CognitiveScenario,
} from '../../src/cognitive'

const scenario: CognitiveScenario = {
  id: 'metacognitive_research',
  users: [
    {
      id: 'u_meta',
      seedEngrams: [
        {
          type: 'behavioral_pattern',
          memoryKind: 'behavioral',
          content: 'El usuario prefiere arquitectura cognitiva concreta y testeable',
          confidence: 0.86,
          emotionalWeight: 0.35,
          behavioralEffects: ['increase_specificity', 'more_direct_tone'],
        },
        {
          type: 'preference_signal',
          memoryKind: 'behavioral',
          content: 'El usuario prefiere sistemas cognitivos observables con tests',
          confidence: 0.8,
          emotionalWeight: 0.32,
          behavioralEffects: ['increase_specificity', 'reduce_repetition'],
        },
        {
          type: 'relational_state',
          memoryKind: 'identity',
          content: 'Relacion tecnica colaborativa con tolerancia a iniciativa moderada',
          confidence: 0.72,
          emotionalWeight: 0.25,
          behavioralEffects: ['increase_initiative'],
        },
        {
          type: 'preference_signal',
          memoryKind: 'emotional',
          content: 'Cuando hay frustracion conviene bajar verbosidad y usar tono calido',
          confidence: 0.65,
          emotionalWeight: 0.7,
          behavioralEffects: ['warmer_tone', 'decrease_verbosity'],
        },
      ],
    },
  ],
  sessions: [
    {
      id: 's_meta_1',
      userId: 'u_meta',
      startAt: '2026-05-17T12:00:00.000Z',
      turns: [
        { role: 'user', text: 'Quiero arquitectura cognitiva concreta y testeable' },
        { role: 'user', text: 'Bien, agrega observabilidad y tests para esa arquitectura cognitiva', skipMinutes: 30 },
        { role: 'user', text: 'Ahora probemos consolidacion de memoria observable', skipMinutes: 60 },
      ],
    },
  ],
  expectations: {
    expectedEngramKeywords: ['cognitiva', 'tests'],
    expectedBehavior: { minSpecificity: 0.5 },
  },
}

function testReflectionAndAdvancedMetrics(): void {
  const runner = new ScenarioRunner()
  const result = runner.run(scenario)
  const events = new CognitiveEventBus()
  const reflection = new ReflectionEngine().reflect(result.frames, new Date('2026-06-01T00:00:00.000Z'), events)
  assert.ok(reflection.summary.includes('frames'))
  assert.ok(reflection.recurrentPatterns.length >= 1)
  assert.ok(events.getEvents().some(event => event.type === 'reflection.generated'))

  const metrics = new AdvancedCognitiveMetrics().score(result.frames, ['cognitiva', 'tests'])
  assert.ok(metrics.memoryEntropy > 0)
  assert.ok(metrics.recallRecall > 0)
  assert.ok(metrics.longTermStability > 0)
}

function testConsolidationAndSemanticGraph(): void {
  const store = new EngramStore()
  store.create({
    type: 'behavioral_pattern',
    memoryKind: 'behavioral',
    content: 'Prefiere arquitectura cognitiva observable con tests',
    confidence: 0.82,
    behavioralEffects: ['increase_specificity'],
  })
  store.create({
    type: 'preference_signal',
    memoryKind: 'behavioral',
    content: 'Prefiere arquitectura cognitiva testeable y observable',
    confidence: 0.78,
    behavioralEffects: ['reduce_repetition'],
  })
  store.create({
    type: 'semantic_fact',
    memoryKind: 'semantic',
    content: 'El proyecto usa TypeScript',
    confidence: 0.9,
  })

  const events = new CognitiveEventBus()
  const consolidation = new MemoryConsolidationSystem().consolidate(store, events)
  assert.ok(consolidation.createdTraits.length >= 1)
  assert.ok(events.getEvents().some(event => event.type === 'engram.consolidated'))

  const graph = new SemanticGraphEngine().build(store.all(), events)
  assert.ok(graph.nodes.length >= 3)
  assert.ok(graph.edges.some(edge => edge.type === 'similar'))
  const recalled = new SemanticGraphEngine().associativeRecall(store.all(), [store.all()[0].id], 1)
  assert.ok(recalled.length >= 1)
}

function testPolicyShadowAndLongitudinalSuite(): void {
  const policy = new CognitivePolicyLayer()
  assert.equal(policy.canCreate({
    type: 'semantic_fact',
    content: 'mi password es abc',
  }).allowed, false)

  const runner = new ScenarioRunner()
  const result = runner.run(scenario)
  const last = [...result.frames].reverse().find(frame => frame.activated.length > 0)
  assert.ok(last)
  const events = new CognitiveEventBus()
  const context = new ShadowLLMAdapter().buildContext({
    activated: last.activated,
    engrams: last.engrams,
    behavior: last.behavior,
    events,
  })
  assert.ok(context.activeEngrams.length > 0)
  assert.ok(context.identitySummaries.length > 0)
  assert.ok(events.getEvents().some(event => event.type === 'shadow_llm.context_built'))

  const longitudinal = new LongitudinalSimulationSuite().run({
    scenario,
    weeks: 3,
    sessionsPerWeek: 1,
    driftEveryWeeks: 2,
  })
  assert.equal(longitudinal.runs.length, 3)
  assert.ok(longitudinal.combinedFrames.length >= 9)
}

const tests = [
  testReflectionAndAdvancedMetrics,
  testConsolidationAndSemanticGraph,
  testPolicyShadowAndLongitudinalSuite,
]

for (const test of tests) {
  test()
  console.log(`ok - ${test.name}`)
}
