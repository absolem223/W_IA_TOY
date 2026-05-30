import assert from 'assert'
import {
  CognitiveDevTools,
  CognitiveHealthMonitor,
  CognitiveRuntimeProfiler,
  DefaultSemanticScoringBackend,
  EmergentBehaviorAnalysis,
  HashEmbeddingProvider,
  ScenarioRunner,
  SemanticGraphEngine,
  SimilarityClusteringProvider,
  SnapshotPersistenceLayer,
  SyntheticUserFramework,
  type CognitiveScenario,
} from '../../src/cognitive'

function buildScenario(): CognitiveScenario {
  const framework = new SyntheticUserFramework()
  const profile = framework.createProfile('synthetic_stability', {
    precision: 0.9,
    warmthNeed: 0.35,
    volatility: 0.5,
    contradictionRate: 0.25,
    manipulationRate: 0.2,
    initiativeTolerance: 0.7,
  })
  return framework.toScenario(profile, {
    weeks: 2,
    turnsPerSession: 5,
    startAt: '2026-05-17T00:00:00.000Z',
  })
}

function testSyntheticHealthDevtoolsAndSnapshots(): void {
  const scenario = buildScenario()
  const result = new ScenarioRunner().run(scenario)
  assert.ok(result.frames.length >= 10)

  const graph = new SemanticGraphEngine().build(result.frames.at(-1)?.engrams ?? [])
  const health = new CognitiveHealthMonitor().analyze({ frames: result.frames, graph })
  assert.ok(health.score >= 0)
  assert.ok(['healthy', 'warning', 'critical'].includes(health.status))

  const devtools = new CognitiveDevTools()
  assert.equal(devtools.timeline(result.frames).length, result.frames.length)
  assert.ok(devtools.traitEvolution(result.snapshots).length > 0)
  assert.ok(Object.keys(devtools.reinforcementHeatmap(result.snapshots)).length > 0)
  const diff = devtools.diffSnapshots(result.snapshots[0], result.snapshots.at(-1)!)
  assert.equal(diff.from, result.snapshots[0].frameId)

  const persistence = new SnapshotPersistenceLayer()
  const serialized = persistence.export(result.snapshots, new Date('2026-05-18T00:00:00.000Z'))
  const imported = persistence.import(serialized)
  assert.equal(imported.snapshots.length, result.snapshots.length)
  assert.equal(persistence.verifyReplayIntegrity(imported.snapshots).valid, true)
}

function testEmbeddingProvidersEmergenceAndProfiler(): void {
  const scenario = buildScenario()
  const result = new ScenarioRunner().run(scenario)
  const latestEngrams = result.frames.at(-1)?.engrams ?? []
  const provider = new HashEmbeddingProvider()
  const vector = provider.embed('respuesta concreta verificable')
  assert.ok(vector.length > 0)

  const scorer = new DefaultSemanticScoringBackend()
  assert.ok(scorer.score('respuesta concreta verificable', latestEngrams[0]) >= 0)

  const clusters = new SimilarityClusteringProvider().cluster(latestEngrams, 0.2)
  assert.ok(clusters.length > 0)

  const emergent = new EmergentBehaviorAnalysis().analyze(result.frames, result.snapshots)
  assert.ok(Array.isArray(emergent))

  const graph = new SemanticGraphEngine().build(latestEngrams)
  const profile = new CognitiveRuntimeProfiler().profile({
    frames: result.frames,
    graph,
    startedAt: 10,
    endedAt: 25,
  })
  assert.equal(profile.measuredMs, 15)
  assert.ok(profile.estimatedMemoryBytes > 0)
  assert.ok(profile.activationCost >= 0)
}

function testHealthDetectsObsessiveActivation(): void {
  const scenario = buildScenario()
  const result = new ScenarioRunner().run(scenario)
  const seedFrame = result.frames[0]
  const engram = seedFrame.engrams[0]
  assert.ok(engram)
  const pathologicalFrames = Array.from({ length: 10 }, (_, index) => ({
    ...seedFrame,
    frameId: `pathological_${index}`,
    activated: [{
      engram,
      score: 0.95,
      reasons: {
        semanticSimilarity: 1,
        confidence: engram.confidence,
        emotionalBoost: 1,
        recencyMultiplier: 1,
      },
    }],
  }))
  const report = new CognitiveHealthMonitor().analyze({ frames: pathologicalFrames })
  assert.ok(report.issues.some(issue => issue.type === 'obsessive_activation' || issue.type === 'cognitive_loop'))
}

const tests = [
  testSyntheticHealthDevtoolsAndSnapshots,
  testEmbeddingProvidersEmergenceAndProfiler,
  testHealthDetectsObsessiveActivation,
]

for (const test of tests) {
  test()
  console.log(`ok - ${test.name}`)
}
