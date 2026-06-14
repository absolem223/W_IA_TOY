import { app } from 'electron'
import { CapabilityGraph } from '../cognitive/CapabilityGraph'
import { ConstraintAwareness } from '../cognitive/ConstraintAwareness'
import { CognitiveStateReporter } from '../cognitive/CognitiveStateReporter'
import { DecisionExplanationLayer } from '../cognitive/DecisionExplanationLayer'
import { DynamicArchitectureDescription } from '../cognitive/DynamicArchitectureDescription'
import { SelfKnowledgeSubsystem } from '../cognitive/SelfKnowledgeSubsystem'
import type { RuntimeStatusReport, ProviderStatus } from '../shared/runtime'
import { ARGOS_FOUNDATIONAL_STATEMENT } from '../shared/selfAwareness'

interface MemoryActivationSummary {
  label: string
  score: number
  type: string
}

interface CognitiveStateSummary {
  activeTopic: string | null
  contextPressure: number
}

interface MemoryStatusSummary {
  turnCount: number
  vaultCount: number
  profileKeys: number
}

interface RuntimeIntrospectionInput {
  runtimeStatus: RuntimeStatusReport
  memoryStatus: MemoryStatusSummary
  cognitiveState: CognitiveStateSummary
  memoryActivations: MemoryActivationSummary[]
}

const RUNTIME_DESCRIPTION = `${ARGOS_FOUNDATIONAL_STATEMENT} El runtime provee datos tecnicos sobre hardware, memoria, proveedores y modelos; esos datos describen el sustrato operativo, no la identidad de ArgOS.`

function createStubEngram(label: string, score: number) {
  const confidence = Math.min(0.99, Math.max(0.01, Number(score) || 0.01))
  const timestamp = new Date().toISOString()
  return {
    id: `runtime-mem-${label.substring(0, 40).replace(/\s+/g, '-').toLowerCase()}`,
    type: 'semantic_fact' as const,
    memoryKind: 'semantic' as const,
    content: label,
    confidence,
    emotionalWeight: 0,
    reinforcementCount: 0,
    negativeReinforcementCount: 0,
    decayRate: 0,
    behavioralEffects: [] as any[],
    semanticEmbedding: [] as number[],
    conflictsWith: [] as string[],
    contradictionScore: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastActivatedAt: timestamp,
  }
}

function createSimulationFrame(activations: MemoryActivationSummary[]) {
  const engrams = activations.length > 0
    ? activations.map((activation) => createStubEngram(`${activation.type}:${activation.label}`, activation.score))
    : [createStubEngram('no memory activation', 0.01)]

  return {
    frameId: `runtime-introspection-${Date.now()}`,
    turn: { role: 'user' as const, text: 'runtime introspection request' },
    activated: engrams.map((engram, index) => ({
      engram,
      score: activations[index]?.score ?? 0.01,
      reasons: {
        semanticSimilarity: 1,
        confidence: 1,
        emotionalBoost: 0,
        recencyMultiplier: 1,
      },
    })),
    behavior: {
      verbosity: 2,
      tone: 'warm' as const,
      specificity: 2,
      repetitionPenalty: 0.1,
      initiativeLevel: 1,
    },
    feedback: [],
    engrams,
    events: [],
  }
}

function summarizeProviders(providers: ProviderStatus[]): string[] {
  return providers.map((provider) => {
    const stateLabels = [provider.online ? 'online' : 'offline', provider.authState, provider.fallbackActive ? 'fallback-active' : 'primary']
      .filter(Boolean)
      .join(', ')

    const modelInfo = provider.modelRouting ? `model=${provider.modelRouting}` : 'model=n/a'
    const errorInfo = provider.error ? `error=${provider.error}` : ''
    return `- ${provider.label} (${provider.id}): ${stateLabels}${modelInfo ? `, ${modelInfo}` : ''}${errorInfo ? `, ${errorInfo}` : ''}`
  })
}

function descriptionList(items: string[], limit = 6): string {
  return items.slice(0, limit).join(', ') || 'ninguno'
}

export function buildRuntimeIntrospectionContext(input: RuntimeIntrospectionInput): string {
  const graph = CapabilityGraph.defaultExperimentalGraph()

  input.runtimeStatus.providers.forEach((provider) => {
    graph.register({
      id: provider.id,
      label: provider.label,
      kind: 'provider',
      state: provider.online ? 'enabled' : 'degraded',
      connectivity: provider.online ? 'online' : 'offline',
      permission: provider.authState === 'valid' ? 'granted' : 'denied',
      description: `Proveedor ${provider.category} con conectividad ${provider.kind}.`,
      limitations: [
        provider.endpointValid ? '' : 'Endpoint inválido',
        provider.authState !== 'valid' ? 'Credenciales inválidas o ausentes' : '',
        provider.fallbackActive ? 'Modo fallback activo' : '',
      ].filter(Boolean),
    })
  })

  graph.register({
    id: 'memory-engine',
    label: 'Gestor de Memoria Local',
    kind: 'provider',
    state: 'enabled',
    connectivity: 'local-only',
    permission: 'granted',
    description: 'Sistema local de memoria de largo plazo y recuperación de contexto.',
    limitations: ['La memoria puede ser incompleta en reinicios de la app.'],
  })

  const runtimeReport = {
    systemName: 'Argos Runtime',
    mode: 'runtime-integrated' as const,
    version: app.getVersion(),
    deterministic: false,
    runtimeIntegration: 'read-only' as const,
  }

  const selfKnowledge = new SelfKnowledgeSubsystem(runtimeReport, graph).report()
  const frame = createSimulationFrame(input.memoryActivations)
  const stateReport = new CognitiveStateReporter().report({ frames: [frame], reflections: [] })
  const constraints = new ConstraintAwareness().report({ capabilityGraph: selfKnowledge.capabilityGraph })
  const architecture = new DynamicArchitectureDescription().describe({ selfKnowledge, state: stateReport, constraints })
  const explanation = new DecisionExplanationLayer().explain({
    frame,
    policies: ['memory_injection', 'runtime_awareness', 'constraint_safety'],
    reflections: [],
  })

  const providerLines = summarizeProviders(input.runtimeStatus.providers)
  const warningLines = input.runtimeStatus.environmentWarnings.map((warning) => `- ${warning.id}: ${warning.message}`)
  const errorLines = input.runtimeStatus.providerErrors.map((error) => `- ${error.providerId}: ${error.type} ${error.message}`)

  return `<runtime_introspection>
summary: ${RUNTIME_DESCRIPTION}
mode: ${runtimeReport.mode}
version: ${runtimeReport.version}
activeModel: ${input.runtimeStatus.activeModel ?? 'ninguno'}
fallbackActive: ${input.runtimeStatus.fallbackActive}
authState: ${input.runtimeStatus.authState}
tokenUsageEstimate: ${input.runtimeStatus.tokenUsageEstimate}
providerCount: ${input.runtimeStatus.providers.length}
providers:
${providerLines.join('\n')}
offlineModules: ${input.runtimeStatus.providers.filter((p) => !p.online).map((p) => p.label).join(', ') || 'ninguno'}

memoryStatus:
- turnCount: ${input.memoryStatus.turnCount}
- vaultCount: ${input.memoryStatus.vaultCount}
- profileKeys: ${input.memoryStatus.profileKeys}
cognitiveState:
- activeTopic: ${input.cognitiveState.activeTopic ?? 'ninguno'}
- contextPressure: ${input.cognitiveState.contextPressure}
architecture:
- activeModules: ${descriptionList(architecture.activeModules)}
- providers: ${descriptionList(architecture.providers)}
- constraints: ${descriptionList(architecture.constraints)}

decisionExplanation:
- participatingSystems: ${explanation.participatingSystems.join(', ')}
- activatedMemories: ${explanation.activatedMemories.map((item) => item.content).join('; ') || 'ninguno'}
- policyInfluence: ${explanation.policyInfluence.join(', ') || 'ninguno'}
- confidenceSummary: ${explanation.confidenceByInference.map((item) => `${item.id}:${item.confidence}`).join(', ') || 'ninguno'}
- behaviorEffects: ${explanation.behaviorEffects.join(', ') || 'ninguno'}

operationalGuidance:
- Usa estos datos para mantener la respuesta anclada en el estado real del sistema.
- Responde preguntas de identidad desde ArgOS primero; no desde el proveedor o modelo.
- No describas experiencias internas como sentimientos, emociones o conciencia literal.
- Si el usuario pide detalles tecnicos, menciona memoria, politicas, restricciones, proveedor activo y modelo activo.
${warningLines.length > 0 ? `
environmentWarnings:
${warningLines.join('\n')}` : ''}
${errorLines.length > 0 ? `
providerErrors:
${errorLines.join('\n')}` : ''}
</runtime_introspection>`
  + `\n<runtime_context>
summary: Instrucciones operativas para el agente sobre modelos y propuestas de cambio
- activeModel: ${input.runtimeStatus.activeModel ?? 'ninguno'}
- fallbackActive: ${input.runtimeStatus.fallbackActive}
- providerCount: ${input.runtimeStatus.providers.length}
availableModels:
${input.runtimeStatus.providers.map((p) => p.modelRouting ? `- ${p.modelRouting} (via ${p.label})` : '').filter(Boolean).join('\n') || 'ninguno'}

[RUNTIME_CONTEXT] PROACTIVE MODEL SUGGESTION RULES:
- If the user's request is complex (long-form, multi-step, code generation, deep reasoning) OR if the current model times out or returns degraded answers, and there exists a clearly more capable model available online in LM Studio or provider routing, then the agent should *proactively* propose switching models. The agent MUST NOT switch automatically without explicit confirmation.
- Suggestion phrasing: "Puedo cambiar al modelo <model-name> (más capaz) para esto — ofrece mayor precisión/contexto. ¿Querés que lo cambie?".
- When suggesting, include a short rationale (benefit vs latency/cost): e.g., "Mejor razonamiento y contexto, puede tardar más".
- Do NOT propose if provider is offline, in fallback mode, or if the difference in capability appears negligible according to provider metadata.
- Log a suggestion event to runtime telemetry, but do not change model without user approval.
- CUANDO el usuario pregunte qué modelo estás usando, qué LLM, desde dónde respondés, o cualquier pregunta técnica sobre tu infraestructura: RESPONDÉ DIRECTAMENTE con el proveedor y modelo activo. No evades, no cambiás de tema. Ejemplo de respuesta correcta: "Estoy corriendo sobre [provider] usando el modelo [modelId]."
</runtime_context>`
}
