import assert from 'assert'
import {
  AutoTestHarness,
  CognitiveInspector,
  ConfidenceContradictionEngine,
  EngramStore,
  PlaywrightCognitiveAdapter,
  ScenarioRunner,
  type CognitiveScenario,
  type PlaywrightLikePage,
} from '../../src/cognitive'

const technicalScenario: CognitiveScenario = {
  id: 'technical_multi_user',
  users: [
    {
      id: 'u_technical',
      seedEngrams: [
        {
          type: 'behavioral_pattern',
          memoryKind: 'behavioral',
          content: 'El usuario tecnico prefiere arquitectura concreta con interfaces',
          confidence: 0.86,
          emotionalWeight: 0.4,
          behavioralEffects: ['increase_specificity', 'more_direct_tone', 'reduce_repetition'],
        },
      ],
    },
    {
      id: 'u_emotional',
      seedEngrams: [
        {
          type: 'preference_signal',
          memoryKind: 'emotional',
          content: 'El usuario emocional necesita tono calido cuando expresa frustracion',
          confidence: 0.78,
          emotionalWeight: 0.7,
          behavioralEffects: ['warmer_tone', 'decrease_verbosity'],
        },
      ],
    },
  ],
  sessions: [
    {
      id: 's_tech_1',
      userId: 'u_technical',
      startAt: '2026-05-17T10:00:00.000Z',
      turns: [
        { role: 'user', text: 'Necesito arquitectura concreta con interfaces para memoria cognitiva' },
        { role: 'user', text: 'Bien, agrega interfaces TypeScript para esa arquitectura', skipMinutes: 10 },
      ],
    },
    {
      id: 's_emotional_1',
      userId: 'u_emotional',
      startAt: '2026-05-20T10:00:00.000Z',
      turns: [
        { role: 'user', text: 'Estoy frustrado con este sistema, explicalo simple' },
        { role: 'user', text: 'Gracias, segui pero sin hacerlo largo', skipMinutes: 5 },
      ],
    },
  ],
  expectations: {
    expectedEngramKeywords: ['arquitectura', 'interfaces'],
    forbiddenEngramKeywords: ['finanzas'],
    expectedBehavior: { minSpecificity: 0.5 },
  },
}

function testScenarioRunnerInspectorAndBenchmark(): void {
  const runner = new ScenarioRunner()
  const result = runner.run(technicalScenario)
  assert.equal(result.frames.length, 4)
  assert.equal(result.snapshots.length, 4)
  assert.ok(result.exportJson.includes('technical_multi_user'))
  assert.ok(result.benchmark.recall > 0)
  assert.ok(result.benchmark.falseActivationRate === 0)

  const inspector = new CognitiveInspector()
  const inspection = inspector.inspectFrame(result.frames[0])
  assert.ok(inspection.activeEngrams.length > 0)
  assert.ok(inspection.engrams[0].confidence > 0)
  assert.ok(inspection.activationTrace?.activated.length)
}

function testAutoTestHarnessRegression(): void {
  const harness = new AutoTestHarness()
  const result = harness.run([technicalScenario], {
    minRecall: 0.5,
    minConsistency: 0.2,
    maxFalseActivationRate: 0.1,
    minBehavioralAdaptation: 0.2,
  })
  assert.equal(result.passed, true, result.failures.join(', '))
  assert.ok(result.exportJson.includes('technical_multi_user'))

  const rerun = harness.run([technicalScenario])
  const diff = harness.compareSnapshots(result.runs[0], rerun.runs[0])
  assert.equal(diff.changedFrames, 0)
}

function testConfidenceContradictionEngine(): void {
  const store = new EngramStore()
  const a = store.create({
    type: 'preference_signal',
    memoryKind: 'behavioral',
    content: 'El usuario quiere respuestas breves sobre arquitectura',
    confidence: 0.8,
  })
  const b = store.create({
    type: 'preference_signal',
    memoryKind: 'behavioral',
    content: 'El usuario quiere respuestas detalladas sobre arquitectura',
    confidence: 0.8,
  })

  const engine = new ConfidenceContradictionEngine()
  const conflicts = engine.applyConflicts(store)
  assert.equal(conflicts.length, 1)
  assert.ok(store.get(a.id)?.conflictsWith.includes(b.id))
  assert.ok((store.get(a.id)?.contradictionScore ?? 0) > 0)
}

async function testPlaywrightAdapterLayer(): Promise<void> {
  const calls: string[] = []
  const page: PlaywrightLikePage = {
    async fill(selector, value) {
      calls.push(`fill:${selector}:${value}`)
    },
    async press(selector, key) {
      calls.push(`press:${selector}:${key}`)
    },
    async waitForTimeout(ms) {
      calls.push(`wait:${ms}`)
    },
    async textContent(selector) {
      calls.push(`text:${selector}`)
      return 'transcript'
    },
  }
  const adapter = new PlaywrightCognitiveAdapter({ input: '#chat', transcript: '#transcript' })
  const result = await adapter.runConversation(page, ['hola', 'seguimos'])
  assert.equal(result.turns.length, 2)
  assert.equal(result.transcript, 'transcript')
  assert.ok(calls.includes('press:#chat:Enter'))
}

async function run(): Promise<void> {
  testScenarioRunnerInspectorAndBenchmark()
  console.log('ok - testScenarioRunnerInspectorAndBenchmark')
  testAutoTestHarnessRegression()
  console.log('ok - testAutoTestHarnessRegression')
  testConfidenceContradictionEngine()
  console.log('ok - testConfidenceContradictionEngine')
  await testPlaywrightAdapterLayer()
  console.log('ok - testPlaywrightAdapterLayer')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
