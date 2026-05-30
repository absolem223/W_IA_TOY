import assert from 'assert'
import {
  BehavioralAdaptationEngine,
  ContextActivationEngine,
  EngramStore,
  ReinforcementEngine,
  SimulationHarness,
} from '../../src/cognitive'

function daysFrom(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000)
}

function testContextActivation(): void {
  const store = new EngramStore()
  const engram = store.create({
    type: 'behavioral_pattern',
    content: 'El usuario prefiere respuestas tecnicas concretas sobre arquitectura de memoria',
    confidence: 0.9,
    emotionalWeight: 0.4,
    behavioralEffects: ['increase_specificity', 'more_direct_tone'],
  })

  const engine = new ContextActivationEngine()
  const result = engine.activate(store.all(), {
    text: 'Necesito una arquitectura de memoria concreta y tecnica',
    limit: 3,
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].engram.id, engram.id)
  assert.ok(result[0].score > 0.2, `expected useful activation score, got ${result[0].score}`)
}

function testDegradation(): void {
  const store = new EngramStore()
  const base = new Date('2026-05-17T00:00:00.000Z')
  const engram = store.create({
    type: 'preference_signal',
    content: 'Prefiere respuestas breves cuando esta apurado',
    confidence: 0.8,
    emotionalWeight: 0.5,
    decayRate: 0.2,
    createdAt: base,
  })

  store.degrade(daysFrom(base, 10))
  const degraded = store.get(engram.id)
  assert.ok(degraded)
  assert.ok(degraded.confidence < engram.confidence, 'confidence should decay over simulated time')
  assert.ok(degraded.emotionalWeight < engram.emotionalWeight, 'emotional weight should decay over simulated time')
}

function testReinforcement(): void {
  const store = new EngramStore()
  const engram = store.create({
    type: 'behavioral_pattern',
    content: 'Prefiere precision operacional',
    confidence: 0.45,
    emotionalWeight: 0.2,
  })

  const reinforced = store.reinforce(engram.id, 0.8)
  assert.ok(reinforced)
  assert.equal(reinforced.reinforcementCount, 1)
  assert.ok(reinforced.confidence > engram.confidence)
  assert.ok(reinforced.emotionalWeight > engram.emotionalWeight)
}

function testBehavioralAdaptation(): void {
  const store = new EngramStore()
  const activation = new ContextActivationEngine()
  const behavior = new BehavioralAdaptationEngine()
  store.create({
    type: 'behavioral_pattern',
    content: 'Cuando se discute implementacion el usuario quiere precision y tono directo',
    confidence: 0.95,
    emotionalWeight: 0.7,
    behavioralEffects: ['increase_specificity', 'reduce_repetition', 'increase_initiative', 'more_direct_tone'],
  })

  const activated = activation.activate(store.all(), { text: 'Implementacion concreta del sistema' })
  const state = behavior.compose(activated)
  assert.equal(state.tone, 'direct')
  assert.ok(state.specificity > 0.5)
  assert.ok(state.repetitionPenalty > 0.2)
  assert.ok(state.initiativeLevel > 0.4)
}

function testImplicitFeedbackAndSimulation(): void {
  const harness = new SimulationHarness()
  const base = new Date('2026-05-17T00:00:00.000Z')
  const replay = harness.run({
    seedEngrams: [
      {
        type: 'behavioral_pattern',
        content: 'El usuario valora disenos operativos concretos de arquitectura cognitiva',
        confidence: 0.75,
        emotionalWeight: 0.35,
        behavioralEffects: ['increase_specificity', 'increase_verbosity', 'more_direct_tone'],
        createdAt: base,
      },
    ],
    turns: [
      {
        role: 'user',
        text: 'Quiero un diseno operativo concreto de arquitectura cognitiva',
        timestamp: base,
      },
      {
        role: 'user',
        text: 'Bien, ahora agrega interfaces TypeScript para esa arquitectura cognitiva',
        timestamp: new Date(base.getTime() + 60_000),
      },
    ],
  })

  assert.equal(replay.frames.length, 2)
  assert.ok(replay.frames[0].activated.length > 0)
  assert.ok(replay.frames[1].feedback.some(signal => signal.type === 'continuity'))
  assert.ok(replay.finalEngrams[0].reinforcementCount >= 1)
  assert.ok(replay.frames[1].events.some(event => event.type === 'engram.reinforced'))
}

function testCorrectionFeedback(): void {
  const engine = new ReinforcementEngine()
  const signals = engine.detectFeedback(
    { role: 'user', text: 'Explicame el sistema de memoria persistente' },
    { role: 'user', text: 'No quiero teoria, mas concreto' },
  )

  assert.ok(signals.some(signal => signal.type === 'correction' && signal.polarity === 'negative'))
}

const tests = [
  testContextActivation,
  testDegradation,
  testReinforcement,
  testBehavioralAdaptation,
  testImplicitFeedbackAndSimulation,
  testCorrectionFeedback,
]

for (const test of tests) {
  test()
  console.log(`ok - ${test.name}`)
}
