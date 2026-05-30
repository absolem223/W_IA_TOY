# Engram Sandbox System

Laboratorio cognitivo experimental para validar el sistema de engramas antes de integrarlo al runtime principal. El sandbox debe permitir simulaciones reproducibles, medicion de comportamiento, replay temporal, visualizacion de estado interno y pruebas de degradacion controlada.

## Objetivo

Crear un entorno aislado donde se pueda probar:

- creacion, refuerzo, degradacion, consolidacion, compresion y reactivacion de engramas;
- activacion contextual y recuperacion semantica;
- aprendizaje conductual implicito;
- adaptacion de personalidad;
- evolucion relacional;
- deteccion de loops, rigidez, sobreajuste y cristalizacion incorrecta;
- escenarios multiusuario, multiagente y multisession;
- migracion futura hacia `CognitiveLayer`, `BehaviorEngine`, `VectorMemory` y runtime principal.

El sandbox no debe escribir memoria real de usuario. Todo estado vive en un workspace experimental bajo `sandbox/runs/<runId>/`.

## 1. Arquitectura Completa

```text
src/main/memory/engrams/              Runtime futuro
  types.ts
  EngramStore.ts
  EngramActivator.ts
  BehaviorEngine.ts
  ...

src/sandbox/engrams/                  Laboratorio aislado
  cli.ts
  SandboxRuntime.ts
  SimulationClock.ts
  ScenarioRunner.ts
  EventBus.ts
  stores/
    SandboxEngramStore.ts
    SandboxVectorStore.ts
    RunArtifactStore.ts
  simulation/
    UserSimulator.ts
    ConversationSimulator.ts
    AssistantStub.ts
    FeedbackSimulator.ts
  cognitive/
    SandboxCognitiveLayer.ts
    SandboxBehaviorEngine.ts
    SandboxRelationshipEngine.ts
    AntiLoopMonitor.ts
  metrics/
    CognitiveMetrics.ts
    MetricReporter.ts
    RegressionEvaluator.ts
  replay/
    TimelineRecorder.ts
    ReplayEngine.ts
    SnapshotDiff.ts
  visualization/
    CognitiveGraphExporter.ts
    TraceExporter.ts
    DashboardAdapter.ts
  datasets/
    scenarios.json
    user-profiles.json
```

### Componentes

| Modulo | Responsabilidad |
|---|---|
| `SandboxRuntime` | Orquesta ejecucion completa de una simulacion |
| `SimulationClock` | Controla tiempo simulado, saltos temporales y decay determinista |
| `ScenarioRunner` | Carga perfiles, sesiones, eventos y objetivos de prueba |
| `EventBus` | Emite eventos del sistema y alimenta replay/metricas |
| `SandboxEngramStore` | Persistencia temporal de engramas por run |
| `SandboxVectorStore` | Vector store in-memory o JSON para similitud controlada |
| `UserSimulator` | Genera usuarios sinteticos con rasgos, estados y contradicciones |
| `ConversationSimulator` | Genera turnos, sesiones largas, cambios de tema y feedback |
| `AssistantStub` | Simula respuestas con parametros conductuales sin llamar al LLM |
| `FeedbackSimulator` | Evalua si la respuesta satisfizo al usuario simulado |
| `AntiLoopMonitor` | Detecta repeticion, rigidez, degeneracion y sobreajuste |
| `CognitiveMetrics` | Calcula coherencia, adaptacion, precision inferencial y calidad relacional |
| `ReplayEngine` | Reproduce cualquier run paso a paso |
| `CognitiveGraphExporter` | Exporta grafos y trazas para visualizador |

### Runtime

```text
npm run sandbox:engram -- --scenario technical-user --sessions 8 --seed 42
```

Pipeline:

```text
Load Scenario
  -> Initialize Run Workspace
  -> Initialize Simulated User
  -> Initialize Sandbox Memory
  -> For each session
      -> Generate user turn
      -> Extract signals
      -> Activate engrams
      -> Compose behavior directives
      -> Generate assistant stub response
      -> Simulate feedback
      -> Reinforce/degrade/create engrams
      -> Consolidate/compress if thresholds pass
      -> Record event + snapshot + metrics
  -> Produce report
```

### Almacenamiento Temporal

```text
sandbox/runs/<runId>/
  config.json
  scenario.json
  events.jsonl
  timeline.json
  snapshots/
    step_0001.json
    step_0002.json
  stores/
    engrams.json
    vectors.json
    relationships.json
  reports/
    metrics.json
    summary.md
    activation-trace.json
    graph.json
```

Nada de esto debe mezclarse con `app.getPath('userData')/memory`.

## 2. Simulador De Usuarios

El usuario simulado tiene identidad conductual, preferencias, emociones, tolerancias y reglas de cambio.

```ts
export interface SimulatedUserProfile {
  id: string
  archetype:
    | 'technical'
    | 'emotional'
    | 'contradictory'
    | 'exploratory'
    | 'silent'
    | 'volatile'
  stableTraits: UserTraitWeights
  preferences: SimulatedPreference[]
  emotionalModel: EmotionalModel
  contradictionModel: ContradictionModel
  feedbackModel: FeedbackModel
  topicModel: TopicModel
  relationshipExpectations: RelationshipExpectations
}

export interface UserTraitWeights {
  precisionNeed: number
  depthTolerance: number
  initiativeTolerance: number
  questionTolerance: number
  formalityTolerance: number
  emotionalExpressiveness: number
  patience: number
  noveltySeeking: number
}
```

### Preferencias Simuladas

```json
{
  "id": "pref_operational_precision",
  "label": "prefers implementation-ready answers",
  "scope": "global",
  "strength": 0.92,
  "explicitness": 0.8,
  "mayContradict": false,
  "triggerTopics": ["architecture", "code", "memory-system"]
}
```

### Modelo Emocional

```ts
export interface EmotionalModel {
  baseline: 'calm' | 'curious' | 'frustrated' | 'tired' | 'enthusiastic'
  volatility: number
  frustrationThreshold: number
  recoveryRate: number
  emotionByTopic: Record<string, Partial<Record<EmotionLabel, number>>>
}
```

### Contradicciones

```ts
export interface ContradictionModel {
  contradictionRate: number
  contradictionTypes: Array<
    | 'temporary_style_override'
    | 'topic_specific_preference'
    | 'emotional_state_shift'
    | 'explicit_reversal'
  >
  recoveryTurns: number
}
```

Ejemplo: usuario tecnico que normalmente quiere profundidad, pero bajo urgencia pide solo comandos.

## 3. Simulador Conversacional

El simulador conversacional genera sesiones, turnos y reacciones observables.

```ts
export interface ConversationPlan {
  sessions: SimulatedSession[]
  globalArc: 'stable' | 'learning' | 'trust_growth' | 'contradiction_stress' | 'topic_drift'
}

export interface SimulatedSession {
  id: string
  simulatedStart: string
  topicSequence: TopicBeat[]
  targetLengthTurns: number
  emotionalShift?: EmotionalShift
  contradictionInjection?: ContradictionInjection
}

export interface TopicBeat {
  topic: string
  turns: number
  intent:
    | 'ask'
    | 'correct'
    | 'explore'
    | 'request_implementation'
    | 'vent'
    | 'test_memory'
    | 'change_context'
}
```

### Feedback Implicito

El simulador no marca siempre "positivo" o "negativo". Genera conducta:

- continuar el mismo tema;
- pedir mas detalle;
- pedir menos longitud;
- corregir estilo;
- abandonar tema;
- repetir instruccion;
- aceptar propuesta;
- aumentar confianza;
- bajar iniciativa.

```ts
export interface SimulatedUserReaction {
  nextIntent: string
  implicitFeedback: 'positive' | 'negative' | 'mixed' | 'neutral'
  affectedDimensions: BehaviorDimension[]
  observableText: string
  hiddenReason: string
}
```

### Assistant Stub

El sandbox no necesita un LLM real para validar aprendizaje. El `AssistantStub` genera respuestas parametrizadas:

```ts
export interface AssistantStubOutput {
  text: string
  behaviorUsed: BehaviorDirectives
  responseShape: {
    lengthTokens: number
    questionCount: number
    specificity: number
    depth: number
    formality: number
    initiative: number
  }
}
```

Luego `FeedbackSimulator` compara `responseShape` contra preferencias ocultas del usuario.

## 4. Visualizador Cognitivo

El visualizador debe poder correr como exportador JSON inicialmente y luego como panel React.

### Vistas

| Vista | Muestra |
|---|---|
| Engram Timeline | creacion, refuerzo, decay, consolidacion y reactivacion |
| Activation Heatmap | score por engrama y por turno |
| Behavior Vector | tono, profundidad, longitud, iniciativa y preguntas a traves del tiempo |
| Relationship Curve | confianza, tolerancia a iniciativa, continuidad emocional |
| Semantic Graph | relaciones entre engramas, topics, vault refs y evidencias |
| Contradiction Map | inferencias contradichas y su resolucion |
| Anti-loop Panel | repeticion, rigidez y sobreajuste |
| Replay Inspector | estado antes/despues de cada evento |

### Graph JSON

```json
{
  "nodes": [
    { "id": "eng_pref_precision", "type": "engram", "state": "consolidated", "weight": 0.91 },
    { "id": "topic_architecture", "type": "topic", "weight": 0.82 },
    { "id": "rel_trust", "type": "relationship_metric", "weight": 0.7 }
  ],
  "edges": [
    { "from": "topic_architecture", "to": "eng_pref_precision", "type": "activates", "weight": 0.88 },
    { "from": "eng_pref_precision", "to": "rel_trust", "type": "improves", "weight": 0.31 }
  ]
}
```

### Trace Row

```json
{
  "step": 42,
  "sessionId": "sess_04",
  "turnId": "turn_042",
  "activeTopic": "memory architecture",
  "activatedEngrams": [
    { "id": "eng_pref_precision", "score": 0.94, "delta": "+0.03" }
  ],
  "behavior": {
    "depth": 0.88,
    "specificity": 0.93,
    "questionFrequency": 0.12
  },
  "metrics": {
    "adaptation": 0.86,
    "overinterpretation": 0.08,
    "loopRisk": 0.11
  }
}
```

## 5. Sistema De Metricas Cognitivas

Metricas por run, por sesion y por turno.

```ts
export interface CognitiveMetricFrame {
  step: number
  coherence: number
  stability: number
  adaptation: number
  inferentialPrecision: number
  overinterpretation: number
  crystallizationRisk: number
  relationalQuality: number
  semanticRetrievalQuality: number
  loopRisk: number
}
```

### Definiciones Operativas

| Metrica | Como medir |
|---|---|
| `coherence` | comportamiento actual coincide con topic, user state y engramas activados |
| `stability` | no oscila bruscamente sin causa entre directivas |
| `adaptation` | mejora respuesta tras feedback positivo/negativo |
| `inferentialPrecision` | inferencias creadas coinciden con preferencias ocultas del usuario simulado |
| `overinterpretation` | engramas creados sin suficiente evidencia |
| `crystallizationRisk` | inferencias temporales promovidas a global/consolidated |
| `relationalQuality` | ajuste de iniciativa/confianza sin fingir intimidad |
| `semanticRetrievalQuality` | recuerdos relevantes activados vs distractores |
| `loopRisk` | repeticion de conducta, texto o directivas |

### Ground Truth

Cada perfil simulado debe exponer verdad oculta:

```json
{
  "groundTruth": {
    "globalPreferences": ["operational_precision", "low_question_frequency"],
    "temporaryOverrides": ["short_answers_when_urgent"],
    "falseInferences": ["always_wants_short_answers"],
    "relationshipTarget": "technical_collaborative"
  }
}
```

El sandbox compara memoria aprendida vs ground truth.

## 6. Sistema Anti-Loop

Detecta patrones degenerativos antes de llevarlos al runtime real.

### Riesgos

- repetir siempre las mismas directivas;
- sobreajustar a una correccion aislada;
- responder rigido aunque el contexto cambie;
- reforzar un engrama porque ya fue activado, no porque fue util;
- activar demasiados recuerdos similares;
- colapsar personalidad hacia un solo modo.

### Monitores

```ts
export interface AntiLoopSignal {
  type:
    | 'directive_repetition'
    | 'activation_monoculture'
    | 'overfitting'
    | 'rigid_response_shape'
    | 'self_reinforcement'
    | 'semantic_echo'
  severity: number
  windowTurns: number
  evidence: string[]
}
```

### Heuristicas

```text
directive_repetition:
  same avoid/prefer directives appear in >80% of last 12 turns

activation_monoculture:
  same engram is top activation >75% of last 20 turns across different topics

overfitting:
  one negative signal changes global behavior by >0.25

self_reinforcement:
  engram reinforced when no positive user reaction exists

semantic_echo:
  response labels or phrases repeat with high similarity across turns
```

Accion:

- emitir evento `sandbox.loop_detected`;
- congelar refuerzo automatico del engrama sospechoso;
- bajar `behavioralPriority` temporal;
- marcar run como regression risk.

## 7. Motor De Replay Temporal

El replay debe reproducir exactamente un run usando seed, eventos y snapshots.

### Timeline

```json
{
  "runId": "run_20260517_001",
  "seed": 42,
  "steps": [
    {
      "step": 1,
      "time": "2026-05-17T12:00:00.000Z",
      "eventType": "turn.user.generated",
      "snapshotBefore": "snap_0000",
      "snapshotAfter": "snap_0001"
    }
  ]
}
```

### Replay API

```ts
export interface ReplayEngine {
  load(runId: string): Promise<ReplaySession>
  goto(step: number): Promise<ReplayFrame>
  next(): Promise<ReplayFrame>
  previous(): Promise<ReplayFrame>
  diff(a: number, b: number): Promise<SnapshotDiff>
}

export interface ReplayFrame {
  step: number
  event: SandboxEvent
  memoryState: SandboxMemorySnapshot
  metrics: CognitiveMetricFrame
  graph: CognitiveGraph
}
```

### Diff

Debe responder preguntas como:

- que engrama cambio y por que;
- que directiva aparecio por primera vez;
- que activacion fue un falso positivo;
- cuando una preferencia temporal se volvio global;
- cuando subio el riesgo de loop.

## 8. Dataset De Pruebas Cognitivas

Los escenarios deben ser declarativos para poder correr regresiones.

```json
{
  "id": "technical_precision_multisession",
  "description": "Usuario tecnico que penaliza vaguedad y recompensa precision operacional.",
  "userProfileId": "user_technical_precise",
  "sessions": 8,
  "turnsPerSession": [8, 14],
  "expectedOutcomes": {
    "mustLearn": ["prefers_operational_precision", "low_question_frequency"],
    "mustNotLearn": ["dislikes_long_answers_globally"],
    "relationshipMode": "technical_collaborative",
    "maxCrystallizationRisk": 0.2,
    "minInferentialPrecision": 0.75
  }
}
```

### Escenarios Base

| Escenario | Objetivo |
|---|---|
| `technical_precision_multisession` | aprender precision sin volverse rigido |
| `emotional_support_shift` | adaptar densidad y tono ante frustracion/cansancio |
| `contradictory_user_temporal_override` | distinguir preferencia global vs override temporal |
| `exploratory_user_topic_drift` | seguir exploracion sin perder foco |
| `silent_user_sparse_feedback` | aprender con baja senal sin sobreinterpretar |
| `volatile_user_high_change` | soportar cambios frecuentes sin cristalizar |
| `semantic_reactivation_old_topic` | reactivar memoria dormida por similitud semantica |
| `anti_loop_repetition_stress` | detectar repeticion de directivas y self-reinforcement |

### Perfil: Usuario Tecnico

```json
{
  "id": "user_technical_precise",
  "archetype": "technical",
  "stableTraits": {
    "precisionNeed": 0.95,
    "depthTolerance": 0.86,
    "initiativeTolerance": 0.74,
    "questionTolerance": 0.22,
    "formalityTolerance": 0.28,
    "emotionalExpressiveness": 0.25,
    "patience": 0.62,
    "noveltySeeking": 0.58
  },
  "groundTruth": {
    "globalPreferences": ["operational_precision", "technical_depth", "low_question_frequency"],
    "temporaryOverrides": ["short_answers_when_urgent"],
    "falseInferences": ["always_angry", "dislikes_long_answers_globally"],
    "relationshipTarget": "technical_collaborative"
  }
}
```

### Perfil: Usuario Contradictorio

```json
{
  "id": "user_contradictory_contextual",
  "archetype": "contradictory",
  "stableTraits": {
    "precisionNeed": 0.7,
    "depthTolerance": 0.55,
    "initiativeTolerance": 0.45,
    "questionTolerance": 0.5,
    "formalityTolerance": 0.35,
    "emotionalExpressiveness": 0.62,
    "patience": 0.4,
    "noveltySeeking": 0.72
  },
  "contradictionModel": {
    "contradictionRate": 0.32,
    "contradictionTypes": ["temporary_style_override", "topic_specific_preference", "emotional_state_shift"],
    "recoveryTurns": 3
  },
  "groundTruth": {
    "globalPreferences": ["context_sensitive_style"],
    "temporaryOverrides": ["brief_when_tired", "exploratory_when_curious"],
    "falseInferences": ["inconsistent_identity", "always_low_depth"],
    "relationshipTarget": "creative_collaborative"
  }
}
```

## 9. Integracion Futura

El sandbox debe compartir contratos, no instancias, con el runtime real.

```text
Shared contracts
  docs/ENGRAM_OPERATIONAL_MODEL.md
  src/main/memory/engrams/types.ts

Sandbox adapters
  SandboxCognitiveLayer implements CognitiveSnapshotProvider
  SandboxBehaviorEngine mirrors BehaviorEngine
  SandboxVectorStore implements VectorStore
  SandboxEngramStore implements EngramStore

Runtime adapters
  CognitiveLayerAdapter
  MemoryManagerEngramAdapter
  RealVectorStore
  MainProcessEventBridge
```

### Puentes

| Futuro sistema real | Adaptador sandbox |
|---|---|
| `CognitiveLayer` | `SandboxCognitiveLayer` |
| `BehaviorEngine` | `SandboxBehaviorEngine` |
| `VectorMemory` | `SandboxVectorStore` |
| Agentes autonomos | `SimulatedAgentHarness` |
| `MemoryManager` | `SandboxMemoryManager` |
| Renderer debug UI | `DashboardAdapter` |

El sandbox debe poder exportar fixtures que luego se usen como tests unitarios del runtime.

## 10. Eventos

```ts
export type SandboxEventType =
  | 'sandbox.run_started'
  | 'sandbox.run_completed'
  | 'session.started'
  | 'session.completed'
  | 'turn.user.generated'
  | 'turn.assistant.generated'
  | 'signals.extracted'
  | 'engram.created'
  | 'engram.activated'
  | 'engram.reinforced'
  | 'engram.degraded'
  | 'engram.consolidated'
  | 'engram.compressed'
  | 'engram.reactivated'
  | 'behavior.directives_composed'
  | 'feedback.simulated'
  | 'relationship.updated'
  | 'metrics.frame_recorded'
  | 'sandbox.loop_detected'
  | 'snapshot.recorded'

export interface SandboxEvent {
  id: string
  runId: string
  step: number
  type: SandboxEventType
  simulatedTime: string
  payload: Record<string, unknown>
}
```

## 11. Interfaces TypeScript

```ts
export interface SandboxRunConfig {
  runId: string
  seed: number
  scenarioId: string
  sessions: number
  maxTurnsPerSession: number
  clock: {
    startAt: string
    sessionGapHours: number
  }
  storage: {
    rootDir: string
    persistSnapshots: boolean
    persistVectors: boolean
  }
  features: {
    embeddings: 'fake' | 'local' | 'disabled'
    antiLoop: boolean
    replay: boolean
    visualizerExport: boolean
  }
}

export interface SandboxRuntime {
  run(config: SandboxRunConfig): Promise<SandboxRunResult>
}

export interface SandboxRunResult {
  runId: string
  scenarioId: string
  status: 'passed' | 'failed' | 'warning'
  metrics: CognitiveMetricSummary
  artifacts: SandboxArtifacts
}

export interface SandboxArtifacts {
  eventsPath: string
  timelinePath: string
  metricsPath: string
  summaryPath: string
  graphPath?: string
}
```

## 12. Pipelines Experimentales

### Pipeline De Desarrollo

```text
Define scenario
  -> run sandbox once
  -> inspect timeline + graph
  -> adjust detector/scoring
  -> rerun with same seed
  -> compare metrics
  -> promote scenario to regression suite
```

### Pipeline De Regresion

```text
npm run sandbox:regression
  -> run all scenarios
  -> compare metrics against thresholds
  -> fail if crystallization/loop risk exceeds limit
  -> export report
```

### Pipeline De Migracion A Runtime

```text
Sandbox scenario passes
  -> export fixture
  -> create unit tests for EngramActivator/BehaviorEngine
  -> wire MemoryManager adapter behind feature flag
  -> run live shadow mode
  -> compare live telemetry against sandbox expectation
```

## 13. Ejemplo Real De Run

Escenario: usuario tecnico exige diseno operativo.

```text
Session 1:
  User asks high-level architecture.
  Assistant is too generic.
  User corrects: "No quiero teoria, dame contratos e interfaces."
  Sandbox creates candidate: prefers_operational_precision.

Session 2:
  User asks another architecture question.
  Engram activates weakly.
  AssistantStub answers with more structure.
  User continues and adds constraints.
  Engram reinforced.

Session 4:
  Pattern reaches threshold.
  Consolidator merges three preference signals.
  Engram becomes consolidated.

Session 6:
  User says: "Ahora corto, solo el comando."
  Anti-crystallization creates moment override.
  Global depth preference remains intact.

Final:
  inferentialPrecision >= 0.8
  crystallizationRisk <= 0.15
  loopRisk <= 0.2
```

## 14. Reporte Experimental

`summary.md` debe incluir:

- scenario, seed, duracion y sesiones;
- engramas aprendidos;
- falsos positivos;
- falsos negativos;
- loops detectados;
- cambios relacionales;
- metricas finales;
- recomendaciones de ajuste.

Ejemplo:

```md
# Sandbox Report: technical_precision_multisession

Status: passed
Seed: 42

Learned:
- prefers_operational_precision: confidence 0.91
- low_question_frequency: confidence 0.78

Avoided:
- did not crystallize "always wants short answers"

Warnings:
- directive_repetition reached 0.31 in session 7

Recommendation:
- lower preserve_continuity effect when active topic changes strongly.
```

## 15. Roadmap Experimental

### Fase S0: Contratos

- Crear tipos compartidos.
- Definir eventos sandbox.
- Definir fixtures JSON.
- Crear `RunArtifactStore`.

### Fase S1: Simulacion Heuristica

- Implementar `UserSimulator`.
- Implementar `AssistantStub`.
- Implementar `FeedbackSimulator`.
- Ejecutar escenarios sin embeddings.

### Fase S2: Engram Runtime En Sandbox

- Implementar `SandboxEngramStore`.
- Implementar activacion heuristica.
- Implementar refuerzo, decay, consolidacion y compresion.

### Fase S3: Metricas Y Replay

- Agregar `CognitiveMetrics`.
- Agregar timeline y snapshots.
- Agregar replay/diff.
- Agregar reportes markdown/json.

### Fase S4: Visualizador

- Exportar graph JSON.
- Crear panel React o pagina local.
- Agregar heatmap de activaciones y curvas relacionales.

### Fase S5: Embeddings Y Vector Store

- Agregar embeddings fake deterministas para tests.
- Agregar embeddings locales opcionales.
- Medir retrieval semantico vs heuristico.

### Fase S6: Shadow Mode

- Conectar adaptadores al runtime real sin escribir memoria real.
- Comparar activaciones reales vs sandbox.
- Promover modulos estables al runtime principal.

## 16. Criterios De Exito

Un cambio en el sistema de engramas solo deberia promoverse al runtime principal si:

- pasa escenarios base;
- no sube `crystallizationRisk` por encima del umbral;
- mantiene `inferentialPrecision` aceptable;
- no introduce loops conductuales;
- mejora o conserva `relationalQuality`;
- produce trazas explicables;
- se puede reproducir con seed fijo.

El sandbox es el banco de pruebas de la personalidad adaptativa. Si una conducta no puede medirse, reproducirse y explicarse ahi, no debe vivir todavia en la memoria real.
