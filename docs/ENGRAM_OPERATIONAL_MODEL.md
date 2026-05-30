# Modelo Operativo Del Sistema De Engramas

Este documento define el funcionamiento implementable del sistema de engramas. No describe teoria general: especifica estados, pesos, eventos, estructuras, flujos y puntos de integracion para construir la capa futura en `src/main/memory/engrams/`.

## Vista General

```text
User Turn
  -> WorkingMemory.appendTurn()
  -> CognitiveLayer.processTurn()
  -> SignalExtractor.analyze()
  -> EngramActivator.retrieve()
  -> BehaviorEngine.composeDirectives()
  -> retrieval.assembleMemoryPreamble()
  -> LLM Response
  -> ResponseObserver.observe()
  -> EngramStore.reinforce/degrade/create()
  -> EngramConsolidator.compact()
```

La regla de oro: los engramas no reemplazan la memoria actual. La cruzan. `WorkingMemory` sostiene el presente, `SemanticMemory` sostiene hechos y perfil, `VaultMemory` sostiene recuerdos explicitos, `CognitiveLayer` sostiene foco atencional, y `EngramStore` sostiene huellas que modifican conducta.

## 1. Ciclo De Vida De Un Engrama

### Estados

```text
candidate -> active -> consolidated -> dormant -> reactivated
     |          |             |             |
     |          v             v             v
     +----> contradicted -> archived -> deleted
```

| Estado | Funcion | Puede afectar conducta |
|---|---|---|
| `candidate` | Inferencia nueva, poco estable | No, salvo casos explicitos |
| `active` | Huella vigente y relevante | Si |
| `consolidated` | Patron estable derivado de multiples evidencias | Si, con prioridad alta |
| `dormant` | Baja relevancia actual, conservado historicamente | Solo si se reactiva |
| `reactivated` | Dormido que vuelve por contexto fuerte | Si, temporalmente |
| `contradicted` | Evidencia reciente lo debilita o invalida | No |
| `archived` | Conservado para auditoria o historia | No |
| `deleted` | Eliminado por politica, usuario o limpieza | No |

### Creacion

Un engrama se crea cuando aparece una senal con valor futuro:

- hecho explicito: "uso React y Electron";
- preferencia explicita: "no me des respuestas genericas";
- patron implicito: el usuario corrige vaguedad repetidamente;
- evento episodico: una decision tecnica importante;
- cambio relacional: el usuario acepta mas iniciativa de la IA.

Reglas:

- Si es explicito y no sensible: `candidate` con `confidence >= 0.75`.
- Si es implicito: `candidate` con `confidence <= 0.55`.
- Si toca identidad, salud, finanzas, politica, religion o rasgos personales fuertes: requerir confirmacion o mantenerlo fuera de conducta automatica.

Evento:

```json
{
  "type": "engram.created",
  "engramId": "eng_20260517_001",
  "userId": "local_default",
  "source": "implicit",
  "initialState": "candidate",
  "reason": "User corrected generic answer and asked for operational design."
}
```

### Refuerzo

Un engrama se refuerza cuando nueva evidencia apoya su utilidad.

Efectos:

- aumenta `reinforcement_count`;
- aumenta `confidence` con limite superior;
- actualiza `last_reinforced_at`;
- sube `temporal_relevance`;
- puede pasar de `candidate` a `active`;
- puede pasar de `active` a `consolidated`.

Formula inicial:

```text
confidence = clamp(confidence + reinforcement_strength * (1 - confidence) * 0.35)
behavioral_priority = clamp(behavioral_priority + reinforcement_strength * 0.08)
temporal_relevance = 1.0
reinforcement_count += 1
```

`reinforcement_strength` se calcula con explicitud, continuidad del tema, emocion y similitud con evidencia previa.

### Degradacion

La degradacion evita que una huella vieja siga gobernando respuestas.

Se ejecuta:

- al iniciar sesion;
- despues de cada N turnos;
- antes de activar recuerdos;
- durante consolidacion periodica.

Formula:

```text
age_days = daysSince(last_reinforced_at)
temporal_decay = exp(-decay_rate * age_days)
temporal_relevance = clamp(base_context_relevance * temporal_decay)
```

Reglas:

- Engramas relacionales decaen lento.
- Preferencias de formato decaen medio.
- Estados emocionales decaen rapido.
- Eventos episodicos decaen rapido salvo que esten asociados a un proyecto activo.

### Consolidacion

Consolidar significa convertir varias evidencias parecidas en un patron mas estable.

Condiciones minimas:

- `reinforcement_count >= 3`;
- evidencias en al menos 2 sesiones o 6+ turnos separados;
- contradiccion baja;
- similitud semantica entre evidencias `>= 0.72` cuando existan embeddings, o match heuristico fuerte mientras no existan.

Resultado:

```text
candidate/preference_signal + evidencias repetidas
  -> behavioral_pattern consolidated
```

Ejemplo:

```json
{
  "before": ["dislikes_vagueness_1", "asked_for_operational_design_2", "corrected_theoretical_answer_3"],
  "after": {
    "id": "eng_pref_precision",
    "type": "behavioral_pattern",
    "label": "prefers_operational_precision",
    "state": "consolidated",
    "behavioral_effects": ["increase_specificity", "increase_depth", "reduce_generic_tone"]
  }
}
```

### Compresion

Comprimir reduce ruido sin perder trazabilidad.

Acciones:

- resumir evidencias redundantes;
- conservar ultimas 5 evidencias crudas resumidas;
- mover evidencias viejas a `evidence_summary`;
- fusionar etiquetas equivalentes;
- archivar candidatos absorbidos.

Politica:

```text
if evidence.length > 12:
  keep newest 5
  summarize older 7+
  update evidence_summary
```

### Reactivacion

Un engrama dormido se reactiva cuando el contexto actual coincide fuerte con su disparador.

Condiciones:

- `state === dormant`;
- `contextual_activation >= 0.82`;
- no hay contradiccion reciente;
- no excede presupuesto de activacion.

La reactivacion puede ser temporal:

```text
dormant -> reactivated for current session
if reinforced again -> active
if not reinforced -> dormant
```

### Eliminacion

Eliminar es distinto de archivar.

Se elimina cuando:

- el usuario pide olvidar;
- contiene informacion prohibida;
- esta corrupto;
- es un duplicado exacto sin valor historico;
- expira por politica configurable.

Se archiva cuando:

- ya no afecta conducta pero sirve para trazabilidad;
- fue absorbido por un engrama consolidado;
- hay contradiccion historica util.

Evento:

```json
{
  "type": "engram.deleted",
  "engramId": "eng_sensitive_001",
  "reason": "user_forget_request",
  "deletedAt": "2026-05-17T12:00:00.000Z"
}
```

## 2. Sistema De Prioridad Y Pesos

Todos los pesos principales usan rango `0..1`, excepto `reinforcement_count`.

```ts
export interface EngramWeights {
  confidence: number
  emotionalWeight: number
  behavioralPriority: number
  reinforcementCount: number
  temporalDecay: number
  temporalRelevance: number
  contextualActivation: number
  contradictionScore: number
}
```

### Confidence

Indica cuanto cree el sistema que la huella representa algo real.

Fuentes:

- explicito: `0.75..0.95`;
- implicito unico: `0.25..0.55`;
- implicito repetido: sube gradualmente;
- contradiccion: baja rapido.

### Emotional Weight

No significa que la IA "sienta". Mide intensidad del contexto.

Ejemplos:

- correccion neutra: `0.25`;
- frustracion clara: `0.75`;
- entusiasmo sostenido: `0.65`;
- urgencia operacional: `0.7`;
- charla casual: `0.15`.

### Behavioral Priority

Define cuanto puede modificar la respuesta.

Reglas:

- hechos semanticos: prioridad baja-media;
- preferencias explicitas de estilo: alta;
- estados emocionales temporales: alta pero de corto plazo;
- inferencias implicitas: baja hasta consolidarse.

### Reinforcement Count

Cuenta evidencia compatible, no repeticiones identicas.

Debe guardar ademas:

- `positive_count`;
- `negative_count`;
- `sessions_seen`;
- `last_reinforced_at`;
- `last_contradicted_at`.

### Temporal Decay

Representa perdida por tiempo.

```text
temporal_decay = e ^ (-decay_rate * age_days)
```

Valores sugeridos de `decay_rate`:

| Tipo | decay_rate |
|---|---:|
| emotional_state | 0.9 |
| preference_signal | 0.08 |
| behavioral_pattern | 0.035 |
| semantic_fact | 0.015 |
| relational_state | 0.02 |
| episodic_event | 0.12 |

### Contextual Activation

Score final de activacion para el turno actual.

```text
contextual_activation =
  confidence
  * temporal_relevance
  * semantic_similarity
  * topic_match
  * relationship_fit
  * emotional_fit
  * contradiction_penalty
  * priority_boost
```

Con:

```text
contradiction_penalty = 1 - contradiction_score
priority_boost = 0.7 + behavioral_priority * 0.3
```

## 3. Motor De Activacion Contextual

El activador decide que engramas pasan al prompt y cuales solo quedan como contexto interno.

### Entradas

```ts
export interface ActivationInput {
  userId: string
  sessionId: string
  currentText: string
  currentEmbedding?: number[]
  activeTopic: string | null
  recentIntents: string[]
  contextPressure: number
  emotionalState: EmotionalState
  relationshipState: RelationshipState
  workingTurns: TimestampedTurn[]
  semanticProfile: SemanticMemoryData
  vaultEntries: VaultIndexEntry[]
}
```

### Pipeline

```text
1. Candidate fetch
   - exact tags
   - active topic
   - recent intents
   - semantic vector search
   - relational engrams for userId

2. Scoring
   - semantic similarity
   - keyword/topic overlap
   - recency
   - emotional fit
   - relationship fit
   - contradiction penalty

3. Budgeting
   - max active engrams: 8
   - max behavioral directives: 6
   - max prompt chars: configurable

4. Conflict resolution
   - explicit beats implicit
   - recent explicit beats old explicit
   - consolidated beats candidate
   - current emotional state can override stable style temporarily

5. Output
   - active engrams
   - behavior directives
   - retrieval metadata
```

### Semantica De Scoring

Mientras no exista vector storage, `semantic_similarity` se reemplaza por:

- keyword overlap;
- tags;
- topicos de `CognitiveLayer`;
- labels normalizados;
- ultimos intents.

Cuando existan embeddings:

```text
semantic_similarity = cosine(currentEmbedding, engram.embedding)
```

Umbrales:

- `>= 0.85`: activacion fuerte;
- `0.70..0.84`: activacion media;
- `0.55..0.69`: solo si hay topic/emotion match;
- `< 0.55`: ignorar salvo engrama explicito global.

### Ejemplo

Input:

```text
"NO quiero teoria general. Quiero diseno operativo real listo para implementacion futura."
```

Activaciones esperables:

```json
[
  {
    "label": "prefers_operational_precision",
    "contextual_activation": 0.94,
    "effects": ["increase_specificity", "reduce_generic_tone", "increase_depth"]
  },
  {
    "label": "prefers_direct_execution",
    "contextual_activation": 0.87,
    "effects": ["decrease_questions", "increase_initiative"]
  }
]
```

## 4. Behavioral Adaptation Engine

El `BehaviorEngine` convierte engramas activos en parametros de respuesta.

```ts
export interface BehaviorDirectives {
  tone: 'warm' | 'direct' | 'technical' | 'calm' | 'playful' | 'neutral'
  depth: number
  initiative: number
  length: number
  formality: number
  specificity: number
  questionFrequency: number
  continuity: number
  structure: 'prose' | 'bullets' | 'steps' | 'spec' | 'code_first'
  avoid: string[]
  prefer: string[]
  rationale: DirectiveTrace[]
}

export interface DirectiveTrace {
  engramId: string
  effect: BehavioralEffect
  weight: number
}
```

### Parametros

| Parametro | 0 | 1 |
|---|---|---|
| `depth` | superficial | profundo |
| `initiative` | espera instrucciones | propone/ejecuta |
| `length` | breve | extenso |
| `formality` | casual | formal |
| `specificity` | general | concreto |
| `questionFrequency` | casi no pregunta | pregunta seguido |
| `continuity` | responde solo turno actual | conecta historia |

### Efectos

```ts
const EFFECT_MAP: Record<BehavioralEffect, Partial<BehaviorDirectives>> = {
  increase_specificity: { specificity: +0.18 },
  reduce_generic_tone: { formality: -0.12 },
  increase_depth: { depth: +0.16, length: +0.08 },
  decrease_density: { depth: -0.08, length: -0.12 },
  increase_initiative: { initiative: +0.14 },
  decrease_questions: { questionFrequency: -0.2 },
  preserve_continuity: { continuity: +0.18 },
  use_spanish_by_default: {}
}
```

La salida final se normaliza:

```text
final_param = clamp(base_param + sum(effect_delta * contextual_activation))
```

### Bloque De Prompt

El motor no debe inyectar toda la historia. Debe generar directivas compactas:

```xml
<behavior_directives>
- Responder en espanol, con tono natural y directo.
- Priorizar diseno operacional, estructuras concretas y ejemplos implementables.
- Evitar teoria general, recapitulaciones largas y preguntas innecesarias.
- Usar profundidad alta y especificidad alta.
</behavior_directives>
```

## 5. Aprendizaje Implicito

El sistema observa la reaccion del usuario al turno anterior.

### Senales Positivas

| Senal | Interpretacion | Fuerza |
|---|---|---:|
| Continua el mismo tema con mas detalle | respuesta util | 0.45 |
| Pide expansion sobre una propuesta | enfoque correcto | 0.55 |
| Usa aprobacion breve: "bien", "perfecto" | aceptacion | 0.45 |
| Aporta requisitos adicionales sin corregir | confianza operacional | 0.5 |
| Toma una sugerencia como base | alineacion | 0.6 |

### Senales Negativas

| Senal | Interpretacion | Fuerza |
|---|---|---:|
| "No quiero teoria" | exceso de abstraccion | 0.8 |
| "Eso no" / "asi no" | desalineacion | 0.85 |
| Repite una instruccion ya dada | no se respeto preferencia | 0.65 |
| Cambia abruptamente de tema tras respuesta larga | posible baja utilidad | 0.35 |
| Pide "mas corto" | longitud excesiva | 0.7 |
| Pide "mas profundo" | profundidad insuficiente | 0.7 |

### Observador Post-Respuesta

```ts
export interface ResponseObservation {
  previousAssistantTurnId: string
  nextUserTurnId: string
  continuityScore: number
  correctionScore: number
  abandonmentScore: number
  explicitFeedback?: 'positive' | 'negative'
  inferredFeedback: 'positive' | 'negative' | 'mixed' | 'neutral'
  affectedDimensions: Array<
    'tone' | 'depth' | 'length' | 'specificity' | 'initiative' | 'questions'
  >
}
```

Regla de seguridad: una sola senal implicita no consolida. Solo crea o ajusta candidatos.

## 6. Sistema Anti-Cristalizacion

El anti-cristalizador evita que la IA convierta inferencias temporales en rasgos permanentes.

### Principios

- Toda inferencia implicita empieza provisional.
- Los rasgos globales requieren evidencia multisession.
- El contexto actual puede contradecir preferencias historicas.
- Las memorias deben tener alcance: `global`, `project`, `topic`, `session`, `moment`.
- El sistema distingue "esta vez" de "siempre".

### Scope

```ts
export type EngramScope =
  | { kind: 'global' }
  | { kind: 'project'; projectId: string }
  | { kind: 'topic'; topicId: string }
  | { kind: 'session'; sessionId: string }
  | { kind: 'moment'; expiresAt: string }
```

### Contradicciones

```text
if explicit contradiction:
  confidence -= 0.35
  contradiction_score += 0.5
  add negative evidence

if implicit contradiction:
  confidence -= 0.1
  contradiction_score += 0.15

if contradiction_score >= 0.65:
  state = contradicted
```

### Ejemplo

Un usuario suele preferir detalle, pero dice: "ahora dame solo la respuesta corta".

Resultado correcto:

- no borrar `prefers_depth`;
- crear estado momentaneo `needs_short_answer_now`;
- aplicar respuesta corta en este turno;
- no inferir que cambio su preferencia global.

## 7. Engramas Relacionales

Los engramas relacionales modelan la relacion IA-usuario como dinamica gradual.

```ts
export interface RelationshipState {
  userId: string
  mode:
    | 'task_oriented'
    | 'technical_collaborative'
    | 'creative_collaborative'
    | 'reflective_companion'
    | 'low_context'
  trustLevel: number
  initiativeTolerance: number
  correctionTolerance: number
  playfulnessTolerance: number
  emotionalContinuity: number
  preferredPace: 'slow' | 'balanced' | 'fast'
  updatedAt: string
}
```

### Evolucion

| Senal | Cambio |
|---|---|
| Usuario acepta propuestas no pedidas | sube `initiativeTolerance` |
| Usuario corrige mucho la iniciativa | baja `initiativeTolerance` |
| Usuario comparte contexto personal de trabajo | sube `trustLevel` suavemente |
| Usuario pide continuidad o recuerda cosas previas | sube `emotionalContinuity` |
| Usuario pide solo ejecucion | modo tiende a `task_oriented` |
| Usuario explora ideas con amplitud | modo tiende a `creative_collaborative` |

### Regla

La relacion no debe fingir intimidad. Debe ajustar colaboracion, ritmo, memoria y tono.

## 8. Integracion Tecnica

### CognitiveLayer

Uso:

- provee `activeTopic`;
- provee `recentIntents`;
- provee `contextPressure`;
- ayuda a filtrar candidatos.

Extension sugerida:

```ts
interface CognitiveSnapshot {
  activeTopic: string | null
  recentIntents: string[]
  contextPressure: number
  topicKeywords: string[]
}
```

### WorkingMemory

Uso:

- provee ventana de turnos recientes;
- permite detectar continuidad, correccion, abandono y repeticion;
- almacena temporalmente senales antes de persistir.

Extension:

```ts
interface TurnAnnotation {
  turnId: string
  signals: Signal[]
  activatedEngrams: string[]
  behaviorDirectivesHash: string
}
```

### SemanticMemory

Uso:

- hechos estables;
- preferencias explicitas de usuario;
- identidad del asistente.

Integracion:

- engramas `semantic_fact` consolidados pueden promoverse a `SemanticMemory.profile`;
- patrones conductuales consolidados pueden reflejarse en `SemanticMemory.patterns`;
- no duplicar: guardar referencia cruzada `sourceEngramId`.

### VaultMemory

Uso:

- recuerdos explicitos guardados por usuario;
- nunca auto-modificar contenido del vault.

Integracion:

- un vault entry puede crear un engrama `semantic_fact` o `episodic_event` con `source='explicit'`;
- el engrama referencia `vaultEntryId`;
- si se elimina el vault entry, el engrama asociado baja prioridad o se archiva.

### Vector Storage

Fase local:

```text
engrams.json
engrams.index.json
optional embeddings cache
```

Fase vectorial:

```text
EngramStore
  -> EmbeddingProvider.embed(text)
  -> VectorStore.upsert({ id, vector, metadata })
  -> VectorStore.search(currentEmbedding, filters)
```

Metadata minima:

```json
{
  "id": "eng_pref_precision",
  "userId": "local_default",
  "type": "behavioral_pattern",
  "state": "consolidated",
  "scope": "global",
  "tags": ["precision", "style", "implementation"],
  "updatedAt": "2026-05-17T12:00:00.000Z"
}
```

### Retrieval Pipeline

Actual:

```text
SemanticMemory + VaultMemory + CognitiveLayer
  -> assembleMemoryPreamble()
```

Objetivo:

```text
SemanticMemory + VaultMemory + CognitiveLayer
  -> EngramActivator.activate()
  -> BehaviorEngine.composeDirectives()
  -> assembleMemoryPreamble()
  -> prompt
```

Orden recomendado del preambulo:

```text
assistant_identity
user_profile
behavior_directives
attention_state
relevant_memories
```

## 9. Arquitectura Modular Y Extensible

```text
src/main/memory/engrams/
  types.ts
  EngramStore.ts
  EngramActivator.ts
  EngramDetector.ts
  EngramConsolidator.ts
  BehaviorEngine.ts
  RelationshipEngine.ts
  AntiCrystallization.ts
  EmbeddingProvider.ts
  VectorStore.ts
  events.ts
```

### Contratos

```ts
export interface EngramStore {
  load(userId: string): Promise<void>
  create(input: CreateEngramInput): Promise<Engram>
  update(id: string, patch: Partial<Engram>): Promise<Engram>
  delete(id: string, reason: DeleteReason): Promise<void>
  reinforce(id: string, evidence: EngramEvidence): Promise<Engram>
  degrade(now: Date): Promise<void>
  findCandidates(input: ActivationInput): Promise<Engram[]>
}

export interface VectorStore {
  upsert(item: VectorItem): Promise<void>
  search(query: VectorQuery): Promise<VectorHit[]>
  delete(id: string): Promise<void>
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
}
```

### Multiusuario

Todo engrama debe tener:

- `userId`;
- `workspaceId`;
- `agentId` opcional;
- `scope`;
- politicas de retencion por usuario.

No mezclar engramas entre usuarios salvo que sean templates globales sin datos privados.

### Multiagente

Cada agente puede escribir observaciones, pero no todos pueden modificar memoria.

Permisos:

| Agente | Puede leer | Puede proponer | Puede persistir |
|---|---|---|---|
| Observador | Si | Si | No |
| Conductual | Si | Si | Si, bajo reglas |
| Memoria | Si | Si | Si |
| Arquitecto | Parcial | Si | No |
| Refactorizacion | Parcial | No | No |

### Capacidades Autonomas Futuras

El sistema debe emitir eventos, no ejecutar acciones directas sin autorizacion.

Ejemplo:

```json
{
  "type": "autonomy.intent_detected",
  "intent": "create_memory_summary",
  "requiresConfirmation": true,
  "reason": "Multiple related engrams reached consolidation threshold."
}
```

## 10. Eventos Del Sistema

```ts
export type EngramEventType =
  | 'engram.created'
  | 'engram.reinforced'
  | 'engram.degraded'
  | 'engram.consolidated'
  | 'engram.compressed'
  | 'engram.reactivated'
  | 'engram.contradicted'
  | 'engram.archived'
  | 'engram.deleted'
  | 'behavior.directives_composed'
  | 'relationship.updated'
  | 'activation.completed'

export interface EngramEvent {
  id: string
  type: EngramEventType
  userId: string
  sessionId: string
  engramId?: string
  payload: Record<string, unknown>
  createdAt: string
}
```

Eventos deben guardarse en log tecnico, no necesariamente en memoria permanente. Para depuracion local, un `engram-events.jsonl` es suficiente.

## 11. Estructuras JSON

### Engrama

```json
{
  "id": "eng_pref_operational_precision",
  "userId": "local_default",
  "workspaceId": "local",
  "type": "behavioral_pattern",
  "label": "prefers_operational_precision",
  "content": "El usuario prefiere disenos concretos, implementables y no teoricos.",
  "scope": { "kind": "global" },
  "state": "consolidated",
  "weights": {
    "confidence": 0.91,
    "emotionalWeight": 0.58,
    "behavioralPriority": 0.88,
    "reinforcementCount": 9,
    "temporalDecay": 0.97,
    "temporalRelevance": 0.95,
    "contextualActivation": 0,
    "contradictionScore": 0.04
  },
  "behavioralEffects": [
    "increase_specificity",
    "increase_depth",
    "reduce_generic_tone",
    "decrease_questions"
  ],
  "tags": ["style", "precision", "implementation"],
  "evidence": [
    {
      "source": "explicit",
      "turnId": "turn_001",
      "summary": "User requested operational design, not general theory.",
      "polarity": "positive",
      "strength": 0.9,
      "createdAt": "2026-05-17T12:00:00.000Z"
    }
  ],
  "evidenceSummary": "Repeated preference for concrete implementation-ready architecture.",
  "createdAt": "2026-05-17T12:00:00.000Z",
  "updatedAt": "2026-05-17T12:00:00.000Z",
  "lastReinforcedAt": "2026-05-17T12:00:00.000Z"
}
```

### Activacion

```json
{
  "userId": "local_default",
  "turnId": "turn_104",
  "activated": [
    {
      "engramId": "eng_pref_operational_precision",
      "score": 0.94,
      "reasons": ["semantic_similarity", "explicit_current_request", "recent_pattern"]
    }
  ],
  "directives": {
    "tone": "direct",
    "depth": 0.88,
    "initiative": 0.76,
    "length": 0.78,
    "formality": 0.32,
    "specificity": 0.94,
    "questionFrequency": 0.15,
    "continuity": 0.72,
    "structure": "spec",
    "avoid": ["generic_theory", "unnecessary_questions"],
    "prefer": ["interfaces", "events", "data_flow", "examples"]
  }
}
```

## 12. Interfaces TypeScript Completas

```ts
export type EngramType =
  | 'episodic_event'
  | 'semantic_fact'
  | 'behavioral_pattern'
  | 'relational_state'
  | 'preference_signal'
  | 'emotional_state'

export type EngramState =
  | 'candidate'
  | 'active'
  | 'consolidated'
  | 'dormant'
  | 'reactivated'
  | 'contradicted'
  | 'archived'
  | 'deleted'

export type EvidenceSource =
  | 'explicit'
  | 'implicit'
  | 'reflection'
  | 'vault'
  | 'system'
  | 'agent'

export interface Engram {
  id: string
  userId: string
  workspaceId: string
  agentId?: string
  type: EngramType
  label: string
  content: string
  scope: EngramScope
  state: EngramState
  weights: EngramWeights
  behavioralEffects: BehavioralEffect[]
  tags: string[]
  embedding?: number[]
  evidence: EngramEvidence[]
  evidenceSummary?: string
  sourceRefs: SourceRef[]
  createdAt: string
  updatedAt: string
  lastReinforcedAt?: string
  lastContradictedAt?: string
  expiresAt?: string
}

export interface EngramEvidence {
  source: EvidenceSource
  turnId?: string
  vaultEntryId?: string
  agentId?: string
  summary: string
  polarity: 'positive' | 'negative' | 'neutral'
  strength: number
  createdAt: string
}

export interface SourceRef {
  kind: 'turn' | 'vault' | 'semantic_profile' | 'episode' | 'agent_observation'
  id: string
}

export interface ActivationResult {
  activatedEngrams: ActivatedEngram[]
  dormantMatches: ActivatedEngram[]
  directives: BehaviorDirectives
  promptBlock: string
}

export interface ActivatedEngram {
  engram: Engram
  score: number
  reasons: ActivationReason[]
}

export type ActivationReason =
  | 'semantic_similarity'
  | 'topic_match'
  | 'recent_intent_match'
  | 'emotional_fit'
  | 'relationship_fit'
  | 'explicit_current_request'
  | 'global_preference'
```

## 13. Flujo De Datos

### Antes De Responder

```text
chat:send
  -> MemoryManager.appendTurn(user)
  -> CognitiveLayer.processTurn(user.content)
  -> EngramDetector.extractSignals(user, workingWindow)
  -> EngramActivator.activate(signals + cognitive snapshot)
  -> BehaviorEngine.compose(activeEngrams)
  -> retrieval.assembleMemoryPreamble(..., behaviorDirectives)
  -> proxy stream
```

### Despues De Responder

```text
chat:done
  -> MemoryManager.appendTurn(assistant)
  -> ResponseObserver waits for next user turn
  -> compare next user turn with previous assistant turn
  -> produce ResponseObservation
  -> EngramStore.reinforce/degrade/create
  -> EngramConsolidator.maybeRun()
```

## 14. Ejemplos Reales

### Ejemplo A: Usuario Rechaza Teoria

Usuario:

```text
NO quiero teoria general. Quiero diseno operativo real listo para implementacion futura.
```

Senales:

```json
[
  { "kind": "negative_feedback", "dimension": "specificity", "strength": 0.85 },
  { "kind": "preference", "dimension": "operational_design", "strength": 0.9 },
  { "kind": "style_constraint", "dimension": "avoid_theory", "strength": 0.82 }
]
```

Accion:

- reforzar `prefers_operational_precision`;
- degradar cualquier directiva que favorezca explicacion conceptual extensa;
- subir `specificity`, `depth` y `structure=spec`;
- bajar `questionFrequency`.

### Ejemplo B: Usuario Pide Brevedad Temporal

Usuario:

```text
Ahora corto, solo dame el comando.
```

Accion:

- crear `emotional_state` o `preference_signal` con scope `moment`;
- no modificar preferencia global de profundidad;
- salida breve;
- expira al terminar el turno o a los pocos minutos.

### Ejemplo C: Relacion Mas Colaborativa

Patron:

- el usuario acepta propuestas de arquitectura;
- pide continuidad;
- permite que la IA implemente cambios sin preguntar demasiado.

Resultado:

```json
{
  "type": "relationship.updated",
  "payload": {
    "mode": "technical_collaborative",
    "initiativeTolerance": 0.82,
    "trustLevel": 0.71,
    "preferredPace": "fast"
  }
}
```

Conducta:

- mas iniciativa tecnica;
- menos preguntas preliminares;
- mas continuidad entre turnos;
- mantener controles de seguridad para acciones destructivas.

## 15. Presupuestos Y Limites

Para evitar contaminacion del prompt:

- maximo 8 engramas activados por turno;
- maximo 4 engramas conductuales fuertes;
- maximo 2 engramas relacionales;
- maximo 1 estado emocional temporal dominante;
- maximo 900 caracteres en `<behavior_directives>`;
- nunca inyectar evidencia completa salvo modo debug.

## 16. Orden De Implementacion Recomendado

1. Crear `types.ts` y `EngramStore.ts` con JSON atomico.
2. Agregar `BehaviorEngine.ts` e inyectar `<behavior_directives>`.
3. Agregar `EngramDetector.ts` con reglas explicitas e implicitas simples.
4. Agregar `EngramActivator.ts` con scoring heuristico.
5. Agregar `ResponseObserver` para refuerzo post-respuesta.
6. Agregar `EngramConsolidator.ts`.
7. Agregar embeddings y `VectorStore`.
8. Agregar `RelationshipEngine`.
9. Agregar multiusuario y multiagente.
10. Agregar panel/debug de activaciones en UI.
