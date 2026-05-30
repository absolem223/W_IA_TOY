/**
 * Prompt Layer Orchestrator: Assembles final system prompt from separate layers.
 * Respects context budgets and pressure thresholds.
 */

import { ContextOrchestrator, type PromptLayer, type ContextPressureReport } from './contextOrchestration'
import { RuntimeIntrospectionCompressor } from './runtimeIntrospectionCompressor'
import { MemoryPrioritizer, type MemoryItem, type MemoryScoreBreakdown } from './memoryPrioritizer'
import { ConversationalFocusWindow, type FocusWindowState } from './conversationalFocusWindow'
import type { ChatMessage } from '../shared/types'
import type { ProviderCapabilities } from './services/llm/types'

export interface PromptLayersInput {
  systemIdentity: string
  runtimeIntrospection: Record<string, unknown>
  assistantIdentity: string
  memories: MemoryItem[]
  messageHistory: ChatMessage[]
  userInput: string
  activeTopic?: string
  constraints?: string
  capabilities?: ProviderCapabilities
}

export interface OrchestrationResult {
  finalSystemPrompt: string
  pressure: ContextPressureReport
  injectedLayers: Map<string, { content: string; charCount: number; pressure: number }>
  skippedLayers: string[]
  compressionApplied: Map<string, number> // layerId -> compression ratio
  observability: {
    totalInputTokens: number
    systemPromptTokens: number
    messageHistoryTokens: number
    layerUtilization: Record<string, number>
  }
}

export class PromptLayerOrchestrator {
  private orchestrator: ContextOrchestrator
  private compressor: RuntimeIntrospectionCompressor
  private prioritizer: MemoryPrioritizer
  private focusWindow: ConversationalFocusWindow

  constructor(maxContextTokens = 6000) {
    this.orchestrator = new ContextOrchestrator(maxContextTokens)
    this.compressor = new RuntimeIntrospectionCompressor()
    this.prioritizer = new MemoryPrioritizer()
    this.focusWindow = new ConversationalFocusWindow()
  }

  /**
   * Orchestrate all prompt layers into final system prompt.
   */
  public orchestrate(input: PromptLayersInput): OrchestrationResult {
    this.orchestrator.resetUsage()

    const injectedLayers = new Map<string, { content: string; charCount: number; pressure: number }>()
    const skippedLayers: string[] = []
    const compressionApplied = new Map<string, number>()

    // Layer 1: System Identity (always included, high priority)
    const systemIdentity = input.systemIdentity
    injectedLayers.set('system-identity', {
      content: systemIdentity,
      charCount: systemIdentity.length,
      pressure: 0,
    })
    this.orchestrator.updateLayerUsage('system-identity', systemIdentity.length)

    // Layer 2: Runtime Introspection (compress based on pressure)
    let runtimeIntrospectionContent = ''
    const pressure1 = this.orchestrator.measurePressure(this.getCurrentLayers(injectedLayers))
    const rawIntrospection = JSON.stringify(input.runtimeIntrospection || {})
    const introspectionCompressed = this.compressor.compressToAdaptive(input.runtimeIntrospection as any, pressure1.globalPressure)
    runtimeIntrospectionContent = introspectionCompressed
    injectedLayers.set('runtime-introspection', {
      content: runtimeIntrospectionContent,
      charCount: runtimeIntrospectionContent.length,
      pressure: pressure1.globalPressure,
    })
    this.orchestrator.updateLayerUsage('runtime-introspection', runtimeIntrospectionContent.length)
    compressionApplied.set('runtime-introspection', rawIntrospection.length > 0
      ? Number((runtimeIntrospectionContent.length / rawIntrospection.length).toFixed(3))
      : 1.0
    )

    // Layer 3: Assistant Identity
    const assistantIdContent = input.assistantIdentity
    injectedLayers.set('assistant-identity', {
      content: assistantIdContent,
      charCount: assistantIdContent.length,
      pressure: 0,
    })
    this.orchestrator.updateLayerUsage('assistant-identity', assistantIdContent.length)

    // Layer 4: Memory (prioritized and trimmed)
    let memoryContent = ''
    const pressure2 = this.orchestrator.measurePressure(this.getCurrentLayers(injectedLayers))
    if (pressure2.globalPressure < 85) {
      // Only inject memory if not in extreme pressure
      const scored = this.prioritizer.prioritize(input.memories, {
        userInput: input.userInput,
        activeTopic: input.activeTopic,
        maxMemories: 6,
      })

      const memoryBudget = this.orchestrator.getLayerBudget('memory-context')?.softLimit ?? 800
      const trimmed = this.prioritizer.trimToBudget(scored, memoryBudget)

      if (trimmed.length > 0) {
        memoryContent = this.formatMemoriesForInjection(trimmed)
        injectedLayers.set('memory-context', {
          content: memoryContent,
          charCount: memoryContent.length,
          pressure: pressure2.globalPressure,
        })
        this.orchestrator.updateLayerUsage('memory-context', memoryContent.length)
        compressionApplied.set('memory-context', memoryBudget > 0 ? Number((memoryContent.length / memoryBudget).toFixed(3)) : 1.0)
      }
    } else {
      skippedLayers.push('memory-context (pressure too high)')
    }

    // Layer 5: Conversational Focus Window
    let focusContent = ''
    const pressure3 = this.orchestrator.measurePressure(this.getCurrentLayers(injectedLayers))
    const focusState = this.focusWindow.buildFocusWindow(input.messageHistory, input.userInput, {
      name: this.extractAssistantName(input.assistantIdentity),
    })
    focusContent = this.focusWindow.renderFocusContext(focusState)
    injectedLayers.set('focus-window', {
      content: focusContent,
      charCount: focusContent.length,
      pressure: pressure3.globalPressure,
    })
    this.orchestrator.updateLayerUsage('focus-window', focusContent.length)

    // Layer 6: Operational Constraints
    let constraintsContent = input.constraints || ''
    if (constraintsContent.length === 0) {
      constraintsContent = this.defaultConstraints(input.capabilities)
    }
    injectedLayers.set('constraints', {
      content: constraintsContent,
      charCount: constraintsContent.length,
      pressure: 0,
    })
    this.orchestrator.updateLayerUsage('constraints', constraintsContent.length)

    // Final pressure measurement
    const finalPressure = this.orchestrator.measurePressure(this.getCurrentLayers(injectedLayers))

    // Assemble final system prompt in layer order
    const finalSystemPrompt = Array.from(injectedLayers.values())
      .map((layer) => layer.content)
      .filter((content) => content.length > 0)
      .join('\n\n')

    // Calculate observability metrics
    const observability = {
      totalInputTokens: Math.ceil(finalSystemPrompt.length / 4),
      systemPromptTokens: Math.ceil(finalSystemPrompt.length / 4),
      messageHistoryTokens: Math.ceil(input.messageHistory.reduce((sum, msg) => sum + msg.content.length, 0) / 4),
      layerUtilization: Object.fromEntries(
        Array.from(injectedLayers.entries()).map(([key, layer]) => [
          key,
          Math.round((layer.charCount / (this.orchestrator.getLayerBudget(key)?.softLimit ?? 1)) * 100),
        ])
      ),
    }

    return {
      finalSystemPrompt,
      pressure: finalPressure,
      injectedLayers,
      skippedLayers,
      compressionApplied,
      observability,
    }
  }

  private getCurrentLayers(injected: Map<string, { content: string; charCount: number }>): PromptLayer[] {
    return Array.from(injected.entries()).map(([id, layer]) => ({
      id,
      label: id,
      content: layer.content,
      charCount: layer.charCount,
      isCompressible: !['system-identity', 'constraints'].includes(id),
    }))
  }

  private formatMemoriesForInjection(scored: MemoryScoreBreakdown[]): string {
    const lines = ['<user_profile>']

    for (const item of scored) {
      const score = Math.round(item.finalScore * 100)
      const content = (item.item.content || item.item.label).substring(0, 80)
      lines.push(`- ${item.item.type}: ${content} [relevance: ${score}%]`)
    }

    lines.push('</user_profile>')
    return lines.join('\n')
  }

  private extractAssistantName(identity: string): string {
    const match = identity.match(/assistant_name[:\s]*([^\n,]+)/)
    return match ? match[1].trim() : 'Assistant'
  }

  private defaultConstraints(capabilities?: ProviderCapabilities): string {
    const toolsEnabled = capabilities?.tools ?? true
    const visionEnabled = capabilities?.vision ?? false

    let capabilitiesPrompt = ''
    if (toolsEnabled) {
      capabilitiesPrompt = `You CAN:
- analyze YouTube videos
- retrieve captions and transcripts
- search the web
- ingest multimedia
- query persistent knowledge memory
- retrieve previously processed content

When the user shares a YouTube URL:
1. Use youtube_ingest
2. Wait for processing
3. Query the resulting knowledge
4. Respond using retrieved context

Do NOT claim you cannot access external content if tools are available.`
    } else {
      capabilitiesPrompt = `NOTICE: External tools are currently DISABLED/UNAVAILABLE for this model.
You CANNOT call functions or invoke external search/retrieval tools.
Answer the user's request conversationally based strictly on your pre-existing knowledge and the messages in the conversational history.`
    }

    if (visionEnabled) {
      capabilitiesPrompt += `\n- Image analysis / Vision: ENABLED. You can view and describe uploaded images.`
    }

    return `<operational_constraints>
1. No roleplay consciousness or self-awareness claims.
2. Cite memory, runtime state, and policy when explaining reasoning.
3. Keep responses direct, warm, and personable.
4. Use conversational Spanish (Argentina dialect preferred).
5. Avoid generic LLM disclaimers and repetitive explanations.
6. VOICE/TTS SANITIZATION: NEVER output raw URLs, long IDs (e.g., YouTube IDs like q9Vaoz0hd0U), or technical hashes in your responses. Refer to them naturally (e.g., "el video", "el enlace") or summarize the content. Only output readable, natural language.

<agentic_capabilities>
${capabilitiesPrompt}
</agentic_capabilities>
</operational_constraints>`
  }
}
