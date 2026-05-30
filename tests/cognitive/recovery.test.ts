import Module from 'module'
import assert from 'assert'
import { promises as fs } from 'fs'
import { join } from 'path'

// 1. Mock Electron before any source code imports
const mockElectron = {
  app: {
    getPath: () => './temp-user-data-test',
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    on: () => {},
    handle: () => {},
    removeListener: () => {},
  },
}

const originalRequire = Module.prototype.require
Module.prototype.require = function (id: string) {
  if (id === 'electron') {
    return mockElectron
  }
  return originalRequire.apply(this, arguments as any)
}

// 2. Now import our main components
import { LLMManager } from '../../src/main/services/llm/LLMManager'
import { AgentExecutor } from '../../src/main/agent/AgentExecutor'
import { AgentEventStore } from '../../src/main/agent/AgentEventStore'
import { ToolRegistry } from '../../src/main/tools/ToolRegistry'
import type { InferenceProvider, ProviderCapabilities, ChatCompletionChunk } from '../../src/main/services/llm/types'

// Mock Inference Provider
class MockInferenceProvider implements InferenceProvider {
  id = 'mock-provider'
  name = 'Mock Provider'
  type = 'local' as const

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
    onChunk({ content: 'Mock response text' })
    return {
      finishReason: 'stop',
      model: 'mock-model',
      latencyMs: 10,
      tokenUsageEstimate: 50
    }
  }
}

async function waitForSessionFileDeletion(sessionPath: string, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await fs.access(sessionPath)
      // File still exists, wait 20ms and try again
      await new Promise(resolve => setTimeout(resolve, 20))
    } catch {
      // File does not exist anymore, success!
      return
    }
  }
  throw new Error(`Timeout waiting for session file deletion: ${sessionPath}`)
}

async function runRecoveryTests() {
  console.log('--- RUNNING AGENT EXECUTOR & RECOVERY INTEGRATION TESTS ---')
  const testDir = join(process.cwd(), 'temp-agent-test')
  
  // Cleanup test dir
  await fs.rm(testDir, { recursive: true, force: true })
  await fs.mkdir(testDir, { recursive: true })

  // Initialize LLM Manager
  const llmManager = new LLMManager(testDir, () => {}, () => {})
  const mockProvider = new MockInferenceProvider()
  llmManager.registerProvider(mockProvider)
  await llmManager.initialize()

  // Initialize Tool Registry
  const toolRegistry = new ToolRegistry()
  // Register a replayable tool
  toolRegistry.register({
    name: 'replay_tool',
    description: 'Replay tool',
    parameters: { type: 'object', properties: {} },
    capabilities: ['system'],
    requiresApproval: false,
    isTrusted: true,
    executionPolicy: 'replayable'
  }, async () => ({ success: true, message: 'Replay OK' }))

  // Register a tool requiring confirmation
  toolRegistry.register({
    name: 'danger_tool',
    description: 'Dangerous tool',
    parameters: { type: 'object', properties: {} },
    capabilities: ['system'],
    requiresApproval: true,
    isTrusted: false,
    executionPolicy: 'requires-confirmation'
  }, async () => ({ success: true, message: 'Danger OK' }))

  // Initialize Event Store & Agent Executor
  const eventStore = new AgentEventStore(testDir)
  const agentExecutor = new AgentExecutor(
    testDir,
    llmManager,
    toolRegistry,
    eventStore
  )

  // ── TEST 1: Basic execution loop ──
  console.log('Test 1: Run execution loop and verify state persistence...')
  const mockEventSender = {
    send: (channel: string, ...args: any[]) => {
      // Mock sender
    }
  }

  await agentExecutor.run(1, [{ role: 'user', content: 'hello' }], 'system prompt', mockEventSender)
  
  // Check if session file was cleaned up (since execution finished successfully)
  const sessionPath = join(testDir, 'agent-session.json')
  await waitForSessionFileDeletion(sessionPath)

  // Check audit logs
  const logsPath = join(testDir, 'agent-events.log')
  // Wait a small moment to let the async queue flush to file
  await new Promise(resolve => setTimeout(resolve, 100))
  const logsData = await fs.readFile(logsPath, 'utf-8')
  assert.ok(logsData.includes('SESSION_START'), 'Audit log should contain SESSION_START event')
  assert.ok(logsData.includes('SESSION_COMPLETE'), 'Audit log should contain SESSION_COMPLETE event')

  // ── TEST 2: Session recovery with replayable tool ──
  console.log('Test 2: Recover session with replayable tool call...')
  const mockSessionDataReplay = {
    sessionId: 'session-replay-123',
    correlationId: 'req-replay-123',
    objective: 'run replayable tool',
    phase: 'planning',
    messages: [
      { role: 'user', content: 'run replay' }
    ],
    recursions: 0,
    activeToolCalls: [
      {
        index: 0,
        id: 'call-1',
        name: 'replay_tool',
        argsBuffer: '{}',
        status: 'pending'
      }
    ],
    timestamp: Date.now()
  }

  await fs.writeFile(sessionPath, JSON.stringify(mockSessionDataReplay, null, 2), 'utf-8')

  // Trigger checkAndRecoverSession. Since the tool is 'replayable', it should run automatically without waiting for user approval.
  await agentExecutor.checkAndRecoverSession(mockEventSender)
  
  // Wait for the background recovery to complete and delete the session file
  await waitForSessionFileDeletion(sessionPath)

  await new Promise(resolve => setTimeout(resolve, 100))
  const recoveryLogs = await fs.readFile(logsPath, 'utf-8')
  assert.ok(recoveryLogs.includes('recovered":true'), 'Audit log should track recovery status')

  // ── TEST 3: Session recovery with dangerous tool requiring confirmation ──
  console.log('Test 3: Recover session with dangerous tool call requiring confirmation...')
  const mockSessionDataDanger = {
    sessionId: 'session-danger-123',
    correlationId: 'req-danger-123',
    objective: 'run dangerous tool',
    phase: 'planning',
    messages: [
      { role: 'user', content: 'run danger' }
    ],
    recursions: 0,
    activeToolCalls: [
      {
        index: 0,
        id: 'call-2',
        name: 'danger_tool',
        argsBuffer: '{}',
        status: 'pending'
      }
    ],
    timestamp: Date.now()
  }

  await fs.writeFile(sessionPath, JSON.stringify(mockSessionDataDanger, null, 2), 'utf-8')

  // We start checkAndRecoverSession. It should pause because of the dangerous tool policy.
  // We resolve the recovery asynchronously.
  let recoveryPromise = agentExecutor.checkAndRecoverSession(mockEventSender)

  // Give it a tiny moment to pause, then approve
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.ok(agentExecutor.getCurrentSession() !== null, 'Session should be active and paused')
  
  agentExecutor.resolveRecovery(true) // User approves
  await recoveryPromise

  // Wait for the background recovery to complete and delete the session file
  await waitForSessionFileDeletion(sessionPath)

  // ── TEST 4: Session recovery rejected ──
  console.log('Test 4: Reject recovery for dangerous session...')
  await fs.writeFile(sessionPath, JSON.stringify(mockSessionDataDanger, null, 2), 'utf-8')

  recoveryPromise = agentExecutor.checkAndRecoverSession(mockEventSender)
  await new Promise(resolve => setTimeout(resolve, 100))
  
  agentExecutor.resolveRecovery(false) // User rejects
  await recoveryPromise

  // Session should be cleared
  await waitForSessionFileDeletion(sessionPath)

  // Cleanup test dir
  await fs.rm(testDir, { recursive: true, force: true })
  console.log('ok - testAgentExecutorAndRecovery')
}

runRecoveryTests().catch(err => {
  console.error('Integration test failed:', err)
  process.exit(1)
})
