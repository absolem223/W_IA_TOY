import Module from 'module'
import assert from 'assert'
import { promises as fs } from 'fs'
import { join } from 'path'

// 1. Mock Electron before imports
const listeners: { [channel: string]: Function[] } = {}
const mockWindow = {
  getSize: () => [400, 600],
  setSize: () => {},
  setIgnoreMouseEvents: () => {},
  setFocusable: () => {},
  show: () => {},
  focus: () => {},
  webContents: {
    send: (channel: string, ...args: any[]) => {
      broadcastedEvents.push({ channel, args })
    }
  }
}

const mockElectron = {
  app: {
    getPath: () => './temp-user-data-hardening-test',
  },
  BrowserWindow: {
    getAllWindows: () => [mockWindow],
    fromWebContents: () => mockWindow,
  },
  ipcMain: {
    on: (channel: string, callback: Function) => {
      if (!listeners[channel]) listeners[channel] = []
      listeners[channel].push(callback)
    },
    removeListener: (channel: string, callback: Function) => {
      if (listeners[channel]) {
        listeners[channel] = listeners[channel].filter(cb => cb !== callback)
      }
    },
    handle: () => {},
  },
}

const originalRequire = Module.prototype.require
Module.prototype.require = function (id: string) {
  if (id === 'electron') {
    return mockElectron
  }
  return originalRequire.apply(this, arguments as any)
}

// Capture broadcast events
const broadcastedEvents: Array<{ channel: string; args: any[] }> = []

function emitIpc(channel: string, ...args: any[]) {
  if (listeners[channel]) {
    // Copy the listener list to prevent modifications mid-loop
    const cbs = [...listeners[channel]]
    for (const cb of cbs) {
      cb({ sender: mockElectron.BrowserWindow.getAllWindows()[0].webContents }, ...args)
    }
  }
}

// 2. Import main components
import { LLMManager } from '../../src/main/services/llm/LLMManager'
import { AgentExecutor } from '../../src/main/agent/AgentExecutor'
import { AgentEventStore } from '../../src/main/agent/AgentEventStore'
import { ToolRegistry } from '../../src/main/tools/ToolRegistry'
import { registerIpcHandlers } from '../../src/main/ipc'
import type { InferenceProvider, ProviderCapabilities, ChatCompletionChunk } from '../../src/main/services/llm/types'

// Mock Inference Provider
class MockInferenceProvider implements InferenceProvider {
  id = 'mock-provider'
  name = 'Mock Provider'
  type = 'local' as const
  shouldFailStream = false
  streamResponse = 'Hello there!'
  streamToolCall: any = null

  async initialize(): Promise<void> {}
  async healthCheck(): Promise<{ available: boolean; error?: string }> {
    return { available: true }
  }
  getCapabilities(_modelId: string): ProviderCapabilities {
    return {
      tools: true,
      streaming: true,
      vision: false,
      jsonMode: true,
      longContext: true
    }
  }

  async streamCompletion(
    _messages: any[],
    _options: any,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<any> {
    if (this.shouldFailStream) {
      throw new Error('Inference stream crashed violently')
    }
    
    if (this.streamToolCall) {
      onChunk({ toolCalls: [this.streamToolCall] })
      this.streamToolCall = null
    } else {
      onChunk({ content: this.streamResponse })
    }
    
    return {
      finishReason: 'stop',
      model: 'mock-model',
      latencyMs: 10,
      tokenUsageEstimate: 50
    }
  }
}

async function runHardeningTests() {
  console.log('--- RUNNING RUNTIME HARDENING & SIMULATION TESTS ---')
  const testDir = join(process.cwd(), 'temp-hardening-test')
  
  // Clean up directories
  await fs.rm(testDir, { recursive: true, force: true })
  await fs.mkdir(testDir, { recursive: true })

  const llmManager = new LLMManager(testDir, () => {}, () => {})
  const mockProvider = new MockInferenceProvider()
  llmManager.registerProvider(mockProvider)
  await llmManager.initialize()

  const toolRegistry = new ToolRegistry()
  toolRegistry.register({
    name: 'safe_tool',
    description: 'Safe tool',
    parameters: { type: 'object', properties: {} },
    capabilities: ['system'],
    requiresApproval: false,
    isTrusted: true,
    executionPolicy: 'replayable'
  }, async () => ({ success: true, message: 'Safe Tool executed' }))

  toolRegistry.register({
    name: 'dangerous_tool',
    description: 'Sensitive tool',
    parameters: { type: 'object', properties: {} },
    capabilities: ['system'],
    requiresApproval: true,
    isTrusted: false,
    executionPolicy: 'requires-confirmation'
  }, async () => ({ success: true, message: 'Sensitive Tool executed' }))

  const eventStore = new AgentEventStore(testDir)
  const agentExecutor = new AgentExecutor(
    testDir,
    llmManager,
    toolRegistry,
    eventStore
  )

  const sessionPath = join(testDir, 'agent-session.json')
  const bakSessionPath = join(testDir, 'agent-session.json.bak')

  // Register the IPC handler
  registerIpcHandlers(
    () => {},
    () => {},
    undefined,
    null,
    undefined,
    undefined,
    toolRegistry,
    llmManager,
    agentExecutor
  )

  // ── TEST A: Repeated Crash Recovery & Session Backup (.bak) ──
  console.log('Test A: Verify repeated crashes backup session to .bak and trigger Safe Mode...')
  
  // Set provider to crash streamCompletion
  mockProvider.shouldFailStream = true

  // Initial Run
  await agentExecutor.run(1, [{ role: 'user', content: 'hello user' }], 'system prompt', { send: () => {} })

  // Write manual corrupted session file with 1 failure
  const testSession = {
    sessionId: 'session-crash-123',
    correlationId: 'req-crash-123',
    objective: 'survive crash',
    phase: 'planning',
    messages: [{ role: 'user', content: 'survive crash' }],
    recursions: 0,
    activeToolCalls: [],
    timestamp: Date.now(),
    failureCount: 1
  }
  await fs.writeFile(sessionPath, JSON.stringify(testSession, null, 2), 'utf-8')

  // Trigger recovery loop: failureCount increments to 2
  await agentExecutor.checkAndRecoverSession({ send: () => {} })
  
  // Wait a moment for background recovery failure to complete
  await new Promise(resolve => setTimeout(resolve, 100))

  // Retrieve session data to verify failureCount is 2
  let data = await fs.readFile(sessionPath, 'utf-8')
  let session = JSON.parse(data)
  assert.equal(session.failureCount, 2, 'Session failureCount should increment to 2')

  // Trigger recovery loop again: failureCount increments to 3 -> triggers Safe Mode & backup
  await agentExecutor.checkAndRecoverSession({ send: () => {} })
  await new Promise(resolve => setTimeout(resolve, 100))

  // Assertions for Safe Mode and backup
  assert.ok(agentExecutor.isSafeMode(), 'AgentExecutor should be in Safe Mode')
  
  let bakExists = false
  try {
    await fs.access(bakSessionPath)
    bakExists = true
  } catch {}
  assert.ok(bakExists, 'Backup session file (.json.bak) should be created')

  const bakData = await fs.readFile(bakSessionPath, 'utf-8')
  const bakSession = JSON.parse(bakData)
  assert.equal(bakSession.failureCount, 3, 'Backup session should record 3 failures')
  assert.ok(bakSession.lastFailureReason, 'Backup session should document the last failure reason')
  assert.equal(bakSession.activeProviderId, llmManager.getStatus().providerId, 'Backup session should document the active provider')

  let sessionExists = false
  try {
    await fs.access(sessionPath)
    sessionExists = true
  } catch {}
  assert.equal(sessionExists, false, 'Active session file should be cleaned up after archiving')

  // ── TEST B: Recursion Limit Overflow Triggers Safe Mode ──
  console.log('Test B: Verify recursion limit overflow triggers Safe Mode...')
  
  // Reset Safe Mode state on AgentExecutor
  const executorAny = agentExecutor as any
  executorAny.safeMode = false

  const overflowSession = {
    sessionId: 'session-overflow-123',
    correlationId: 'req-overflow-123',
    objective: 'simulate infinite loop',
    phase: 'executing',
    messages: [{ role: 'user', content: 'hello' }],
    recursions: 5, // MAX_RECURSIONS is 5
    activeToolCalls: [],
    timestamp: Date.now(),
    failureCount: 0
  }
  await fs.writeFile(sessionPath, JSON.stringify(overflowSession, null, 2), 'utf-8')

  // Boot triggers Safe Mode due to recursion overflow check
  await agentExecutor.checkAndRecoverSession({ send: () => {} })
  await new Promise(resolve => setTimeout(resolve, 100))

  assert.ok(agentExecutor.isSafeMode(), 'Recursion overflow session recovery should trigger Safe Mode')

  // ── TEST C: Safe Mode Blocks Tools and Recovery Checks ──
  console.log('Test C: Verify Safe Mode disables tools and stops recovery checks...')

  // Assert recovery early exit in Safe Mode
  await fs.writeFile(sessionPath, JSON.stringify(testSession, null, 2), 'utf-8')
  await agentExecutor.checkAndRecoverSession({ send: () => {} })
  
  let activeSessionStillExists = false
  try {
    await fs.access(sessionPath)
    activeSessionStillExists = true
  } catch {}
  assert.ok(activeSessionStillExists, 'Recovery check should skip execution/archiving when Safe Mode is active')

  // Assert tool execution block in Safe Mode
  const testSessionActiveTools: any = {
    sessionId: 'session-active-tools-123',
    correlationId: 'req-active-tools-123',
    objective: 'run tool',
    phase: 'executing',
    messages: [{ role: 'user', content: 'hello' }],
    recursions: 0,
    activeToolCalls: [{ index: 0, id: 'call-x', name: 'safe_tool', argsBuffer: '{}', status: 'pending' as const }],
    timestamp: Date.now()
  }

  const signal = new AbortController().signal
  const mockSender = { send: () => {} }
  await executorAny.executePendingTools(testSessionActiveTools, testSessionActiveTools.activeToolCalls, mockSender, signal)
  
  assert.equal(testSessionActiveTools.activeToolCalls[0].status, 'completed')
  assert.ok(testSessionActiveTools.activeToolCalls[0].result.error.includes('disabled in Safe Mode'), 'Tools should be rejected with safe mode warning')

  // ── TEST D: Malformed Local Model Outputs JSON Parsing Resilience ──
  console.log('Test D: Verify resilience against malformed JSON arguments from model...')
  
  // Disable Safe Mode for test
  executorAny.safeMode = false
  mockProvider.shouldFailStream = false
  
  // Set provider to stream a tool call with invalid JSON parameters
  mockProvider.streamToolCall = {
    index: 0,
    id: 'call-malformed',
    function: {
      name: 'safe_tool',
      arguments: '{"invalid_json: "missing_quotes}' // malformed
    }
  }

  await agentExecutor.run(2, [{ role: 'user', content: 'run tool' }], 'system prompt', { send: () => {} })

  // Verify that error is logged instead of crashing, and session completes cleanly
  const logsPath = join(testDir, 'agent-events.log')
  await new Promise(resolve => setTimeout(resolve, 100))
  const logsData = await fs.readFile(logsPath, 'utf-8')
  assert.ok(logsData.includes('TOOL_START'), 'Should log TOOL_START for the tool invocation')
  assert.ok(logsData.includes('SESSION_COMPLETE'), 'Executor should complete execution loop gracefully')

  // Reset mock provider tool call
  mockProvider.streamToolCall = null

  // ── TEST E: IPC Interruption Choices for Pending Approvals ──
  console.log('Test E: Verify IPC Backpressure interruption flow and choices...')
  
  // 1. Simulate waiting for tool approval
  executorAny.toolApprovalResolver = (approved: boolean) => {}

  // Trigger new message IPC `chat:send`
  broadcastedEvents.length = 0
  const mockNewMessages = [{ role: 'user', content: 'new urgent prompt' }]
  emitIpc('chat:send', mockNewMessages, 3)

  // Verify interruption event broadcast
  const interruptionEvent = broadcastedEvents.find(e => e.channel === 'agent:approval-interrupted')
  assert.ok(interruptionEvent, 'Interruption event agent:approval-interrupted should be broadcast')
  assert.equal(interruptionEvent.args[0].requestId, 3)
  assert.equal(interruptionEvent.args[0].objective, 'new urgent prompt')

  // Option E1: Continue pending approval
  console.log(' - Option 1: continue-pending')
  broadcastedEvents.length = 0
  emitIpc('agent:resolve-interruption', { option: 'continue-pending' })
  
  const errEvent = broadcastedEvents.find(e => e.channel === 'chat:error' && e.args[0] === 3)
  const doneEvent = broadcastedEvents.find(e => e.channel === 'chat:done' && e.args[0] === 3)
  assert.ok(errEvent, 'Should report warning back to chat interface')
  assert.ok(doneEvent, 'Should close request')

  // Option E2: Cancel pending action
  console.log(' - Option 2: cancel-pending')
  let resolvedApproval: boolean | null = null
  executorAny.toolApprovalResolver = (approved: boolean) => {
    resolvedApproval = approved
  }

  broadcastedEvents.length = 0
  emitIpc('chat:send', mockNewMessages, 4)
  emitIpc('agent:resolve-interruption', { option: 'cancel-pending' })
  
  assert.equal(resolvedApproval, false, 'Pending approval should resolve to false')
  const errEvent4 = broadcastedEvents.find(e => e.channel === 'chat:error' && e.args[0] === 4)
  const doneEvent4 = broadcastedEvents.find(e => e.channel === 'chat:done' && e.args[0] === 4)
  assert.ok(errEvent4, 'Should send cancellation message to sender')
  assert.ok(doneEvent4, 'Should close request')

  // Option E3: Overwrite with new
  console.log(' - Option 3: overwrite-with-new')
  resolvedApproval = null
  executorAny.toolApprovalResolver = (approved: boolean) => {
    resolvedApproval = approved
  }

  broadcastedEvents.length = 0
  emitIpc('chat:send', mockNewMessages, 5)

  let runCalled = false
  executorAny.run = async (requestId: number) => {
    if (requestId === 5) runCalled = true
  }

  emitIpc('agent:resolve-interruption', { option: 'overwrite-with-new' })
  
  assert.equal(resolvedApproval, false, 'Pending approval should resolve to false')
  assert.ok(runCalled, 'Should proceed to run the new message')

  // Cleanup test dir
  await fs.rm(testDir, { recursive: true, force: true })
  console.log('ok - testHardeningAndSafeMode')
}

runHardeningTests().catch(err => {
  console.error('Hardening tests failed:', err)
  process.exit(1)
})
