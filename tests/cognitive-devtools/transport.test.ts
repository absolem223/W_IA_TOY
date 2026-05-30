import assert from 'assert'
import {
  CognitiveEventBus,
  ScenarioRunner,
  SyntheticUserFramework,
} from '../../src/cognitive'
import { CognitiveDevtoolsTransport } from '../../src/cognitive-devtools/transport/CognitiveDevtoolsTransport'

function testTransportStreamsAndSerialization(): void {
  const bus = new CognitiveEventBus()
  const transport = new CognitiveDevtoolsTransport()
  const received: string[] = []
  transport.onEvent(event => received.push(event.type))
  transport.connect(bus)
  bus.emit('simulation.turn', { text: 'hello' }, new Date('2026-05-17T00:00:00.000Z'))
  assert.deepEqual(received, ['simulation.turn'])

  const framework = new SyntheticUserFramework()
  const profile = framework.createProfile('devtools_test', { precision: 0.9 })
  const scenario = framework.toScenario(profile, {
    weeks: 1,
    turnsPerSession: 3,
    startAt: '2026-05-17T00:00:00.000Z',
  })
  const result = new ScenarioRunner().run(scenario)
  transport.pushSimulationFrame(result.frames[0], result.snapshots[0])
  assert.equal(transport.getFrames().length, 1)

  const exported = transport.exportJson(0)
  const imported = new CognitiveDevtoolsTransport().importJson(exported)
  assert.equal(imported.version, 1)
  assert.equal(imported.frames.length, 1)
  assert.ok(exported.includes('simulation.turn'))

  const snapshotJson = transport.exportSnapshots()
  assert.ok(snapshotJson.includes('checksum'))
}

testTransportStreamsAndSerialization()
console.log('ok - testTransportStreamsAndSerialization')
