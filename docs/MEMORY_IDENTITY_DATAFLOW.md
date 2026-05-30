# MEMORY & IDENTITY DATAFLOW — ArgOS 3.1

> Auditoría de flujo real de datos | 2026-05-30  
> Basado en código fuente verificado, sin modificaciones.

---

## 1. Flujo Real Observado — IDENTIDAD

```
semantic.json (en disco, %APPDATA%)
  └─ SemanticMemory.load()                     [semanticMemory.ts:34]
       └─ SemanticMemory.getData()             [semanticMemory.ts:45]
            └─ MemoryManager.getProfile()      [MemoryManager.ts:164]
                 └─ ipc.ts:149                 ← LECTURA DE assistant_name
                      │
                      │  memoryManager?.getProfile()?.assistant?.assistant_name
                      │  → Si existe → "Tu nombre es {nombre}."
                      │  → Si no existe → "" (string vacío)
                      │
                      ↓
              PromptLayerOrchestrator.orchestrate()
                      │
                      │  input.assistantIdentity = "Tu nombre es {nombre}."
                      │                                            [PLO:89]
                      │
                      ├── Layer 3 (assistant-identity): "Tu nombre es {nombre}."
                      │   → Llega al prompt final ✅
                      │
                      └── Layer 5 (focus-window): extractAssistantName()
                               │                          [PLO:206]
                               │  Regex: /assistant_name[:\s]*([^\n,]+)/
                               │  Input recibido: "Tu nombre es Atleta."
                               │  → No matchea el regex (busca "assistant_name:")
                               │  → Retorna: "Assistant" (fallback hardcoded)
                               │
                               ↓
                      <conversational_focus>
                        assistantName: Assistant   ← NOMBRE INCORRECTO
                      </conversational_focus>
                      │
                      └── Layer 6 (constraints): defaultConstraints()
                               │                          [PLO:211]
                               │  Hardcoded: "You are ArgOS, a local cognitive assistant."
                               │                                            [PLO:251]
                               ↓
                      <agentic_capabilities>
                        You are ArgOS, a local cognitive assistant.
                      </agentic_capabilities>
```

### Resumen de identidades que llegan al LLM en cada turn

| Capa | Valor Inyectado | Archivo Responsable | Línea |
|:---|:---|:---|:---|
| Layer 3 — assistant-identity | `"Tu nombre es {assistant_name}."` (dinámico) | `ipc.ts` | 149 |
| Layer 5 — focus-window | `assistantName: Assistant` (fallback por regex fallido) | `promptLayerOrchestrator.ts` | 206-208 |
| Layer 6 — constraints | `You are ArgOS, a local cognitive assistant.` (hardcoded) | `promptLayerOrchestrator.ts` | 251 |

**3 identidades distintas enviadas al LLM en el mismo prompt.**

---

## 2. Flujo Real Observado — MEMORIA

```
semantic.json (disco)
  └─ SemanticMemory.load()                     [semanticMemory.ts:34]
       │  → data.profile = { user_name, preferences, ... }
       │  → data.assistant = { assistant_name: "Atleta", ... }
       │
       └─ MemoryManager.getMemoryContext(userInput)  [MemoryManager.ts:254]
                │
                │  Llama a: assembleMemoryPreamble()  [retrieval.ts:223]
                │
                │  assembleMemoryPreamble() construye:
                │  ┌─────────────────────────────────────────────┐
                │  │  preamble (string): texto completo XML con  │
                │  │    <assistant_identity>                     │
                │  │      assistant_name=Atleta                  │
                │  │      assistant_role=conversacionalista      │
                │  │      ...                                    │
                │  │    </assistant_identity>                    │
                │  │    <user_profile>                           │
                │  │      - user name: Nahuel                    │
                │  │      - preferences: que no me mientan       │
                │  │    </user_profile>                          │
                │  │                                             │
                │  │  usedMemories (array): metadatos SOLAMENTE  │
                │  │    [ {type:"profile", label:"user name", score:1},
                │  │      {type:"profile", label:"preferences", score:1} ]
                │  └─────────────────────────────────────────────┘
                │
                ↓
       ipc.ts:131-133
         const memoryResult = memoryManager?.getMemoryContext(...)
         const memoryCtx    = memoryResult?.preamble    || ''  ← TEXTO COMPLETO
         const usedMemories = memoryResult?.usedMemories || [] ← SOLO METADATOS
                │
                │  ⚠️ PUNTO DE PÉRDIDA — memoryCtx calculado pero NUNCA enviado
                │
                │  Log engañoso en ipc.ts:136:
                │  console.log(`[MEMORY_PREAMBLE] Injected into system prompt: ${memoryCtx.length} chars`)
                │  ↑ FALSO — el log dice "Injected" pero el valor NUNCA se inyecta
                │
                ↓
       PromptLayerOrchestrator.orchestrate({
         memories: usedMemories,   ← SOLO METADATOS (array de {type,label,score})
         // memoryCtx NUNCA pasado como argumento
       })
                │
                ↓
       Layer 4 — memory-context
         MemoryPrioritizer.prioritize(input.memories)
         │  input.memories = [{type:"profile", label:"user name", score:1}, ...]
         │  item.content = undefined (no existe en el objeto MemoryUsedItem)
         │
         └─ formatMemoriesForInjection(trimmed)        [PLO:193]
              │  content = item.item.content || item.item.label
              │  → item.item.content = undefined
              │  → fallback a item.item.label = "user name"
              │
              ↓
         <user_profile>
         - profile: user name [relevance: 42%]
         - profile: preferences [relevance: 42%]
         </user_profile>
         ↑ SOLO etiquetas, sin valores reales ("Nahuel", "que no me mientan")
```

---

## 3. Punto de Pérdida de Memoria

**Archivo:** [`ipc.ts`](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/ipc.ts)  
**Líneas críticas:** 131–150

```typescript
// ipc.ts:131-150 — THE SMOKING GUN

const memoryResult = memoryManager?.getMemoryContext(lastUserMsg?.content || '')
const memoryCtx    = memoryResult?.preamble    || ''  // ← STRING COMPLETO con <assistant_identity>, <user_profile>
const usedMemories = memoryResult?.usedMemories || [] // ← ARRAY de metadatos {type, label, score}

// ⚠️ LOG ENGAÑOSO: dice "Injected" pero memoryCtx nunca se pasa al orquestador
if (memoryCtx) {
  console.log(`[MEMORY_PREAMBLE] Injected into system prompt: ${memoryCtx.length} chars`)
}

// ❌ BUG: memoryCtx está calculado AQUÍ pero NO se pasa como argumento
const orchestrationResult = promptOrchestrator.orchestrate({
  systemIdentity: `...`,
  runtimeIntrospection: ...,
  assistantIdentity: ...,
  memories: usedMemories,     // ← SOLO METADATOS, sin contenido real
  // memoryCtx ← NUNCA ENVIADO
  messageHistory: messages,
  userInput: lastUserMsg?.content || '',
  activeTopic: ...,
  capabilities: ...,
})
```

**Causa exacta:**  
`assembleMemoryPreamble()` devuelve dos objetos: `preamble` (texto XML completo con valores) y `usedMemories` (array de metadatos sin valores). `ipc.ts` los captura ambos pero **solo pasa `usedMemories`** al orquestador. El `preamble` se descarta silenciosamente. El log en línea 136 afirma "Injected" cuando en realidad el valor nunca abandona la variable local `memoryCtx`.

---

## 4. Punto de Colisión de Identidad

**Tres fuentes de identidad contradictorias en el mismo prompt:**

### Colisión A — Layer 3 vs. Layer 6

| | Layer 3 | Layer 6 |
|:---|:---|:---|
| Origen | `ipc.ts:149` (dinámico) | `promptLayerOrchestrator.ts:251` (hardcoded) |
| Valor | `"Tu nombre es Atleta."` | `"You are ArgOS"` |
| Idioma | Español | Inglés |
| Tipo | Memoria de usuario | Constraint operacional |

El LLM recibe dos instrucciones directas de identidad que se contradicen mutuamente. Depende del modelo, del orden de atención, y del turno cuál prevalece.

### Colisión B — Layer 3 vs. Layer 5

| | Layer 3 | Layer 5 |
|:---|:---|:---|
| Origen | `ipc.ts:149` | `promptLayerOrchestrator.ts:206-208` |
| Valor | `"Tu nombre es Atleta."` | `assistantName: Assistant` |
| Causa | Nombre correcto de semantic.json | Regex `/assistant_name[:\s]*/` falla contra el formato `"Tu nombre es X."` → fallback `"Assistant"` |

**El regex es incompatible con el formato del string que intenta parsear:**
```typescript
// extractAssistantName recibe: "Tu nombre es Atleta."
// Regex busca: /assistant_name[:\s]*([^\n,]+)/
// → No matchea → retorna "Assistant"
```

---

## 5. Respuestas a las Preguntas de Verificación

### A) ¿`memoryCtx` llega al prompt final?

**❌ NO.**

`memoryCtx` se calcula en `ipc.ts:132` y nunca se pasa como argumento al orquestador. La variable local existe, tiene contenido real (`<assistant_identity>`, `<user_profile>` con valores), pero se descarta silenciosamente. El log en línea 136 es un **falso positivo**: imprime `memoryCtx.length` pero eso no implica inyección.

### B) ¿`usedMemories` reemplaza a `memoryCtx`?

**✅ SÍ — parcialmente.**

`usedMemories` es el único objeto que llega al orquestador en el campo `memories`. Pero su estructura es `{type, label, score}` — sin `content`. El `MemoryPrioritizer.formatMemoriesForInjection()` intenta usar `item.content`, que es `undefined`, y hace fallback a `item.label`. Resultado: el prompt recibe etiquetas de categoría (`"user name"`, `"preferences"`) pero **no los valores** (`"Nahuel"`, `"que no me mientan"`).

### C) ¿`assistant_name` llega realmente al LLM?

**✅ SÍ — pero corrupto y en colisión.**

El nombre llega **tres veces** al LLM con tres valores distintos:

1. `"Tu nombre es Atleta."` (Layer 3, desde semantic.json — el valor real pero legacy)
2. `"assistantName: Assistant"` (Layer 5, fallback por regex roto)
3. `"You are ArgOS"` (Layer 6, hardcoded en inglés)

El nombre correcto (`Argos`, definido como default en código) **nunca llega** si semantic.json contiene un valor diferente.

### D) ¿Qué nombre recibe actualmente el modelo?

**El modelo recibe los tres nombres simultáneamente.** La respuesta observable depende de:
- Si el LLM prioriza instrucciones al inicio o al final del system prompt
- Si el modelo tiene sesgos hacia el idioma español o inglés en la instrucción de identidad
- Qué tan recientemente en el historial apareció cada nombre

En la práctica observada (PROMPT_TRACE.md): el modelo osciló entre "Atleta" y "ArgOS" en distintas sesiones, con apariciones esporádicas de "Assistant".

---

## 6. Archivos Responsables

| Archivo | Rol en el Bug |
|:---|:---|
| [`ipc.ts:132-150`](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/ipc.ts#L132-L150) | **Bug primario de memoria**: calcula `memoryCtx` y lo descarta. Solo pasa `usedMemories` (metadatos sin valores). |
| [`promptLayerOrchestrator.ts:193-203`](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/promptLayerOrchestrator.ts#L193-L203) | **Bug de formato**: `formatMemoriesForInjection()` usa `item.content` que es `undefined`, fallback a `item.label`. |
| [`promptLayerOrchestrator.ts:206-208`](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/promptLayerOrchestrator.ts#L206-L208) | **Bug de regex**: `extractAssistantName()` falla porque recibe `"Tu nombre es X."` y busca `"assistant_name:"`. |
| [`promptLayerOrchestrator.ts:251`](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/promptLayerOrchestrator.ts#L251) | **Colisión hardcoded**: `"You are ArgOS"` en `defaultConstraints()` contradice la identidad dinámica. |
| [`reconciliation.ts:42-45`](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/memory/reconciliation.ts#L42-L45) | **Reconciliación incompleta**: limpia "Marta", "Rogelia", "Santi", "Argos" pero no "Atlas" ni "Atleta". El nombre legacy persiste en semantic.json. |
| [`proxy.ts:8-37`](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/proxy.ts#L8-L37) | **SYSTEM_PROMPT letra muerta**: define reglas de identidad basadas en `<assistant_identity>` pero esta constante no es usada por el pipeline principal en `ipc.ts`. |

---

## 7. Verdadera Fuente de Verdad (SSOT)

### Para IDENTIDAD

| Nivel | SSOT Real | SSOT Documentada | ¿Coinciden? |
|:---|:---|:---|:---|
| **Código (default)** | `identityLayer.ts:18` → `assistant_name: "Argos"` | Correcto | ✅ |
| **Código (orquestador)** | `promptLayerOrchestrator.ts:251` → `"You are ArgOS"` (hardcoded) | No documentado | ❌ |
| **Disco (runtime)** | `semantic.json` → `assistant_name: "Atleta"` (valor usuario) | `proxy.ts:12` (`<assistant_identity>`) | ❌ (proxy.ts no se usa) |
| **Prompt final (LLM)** | Las 3 fuentes anteriores en simultáneo | — | ❌ |

**SSOT real efectiva:** No existe una fuente única. El LLM resuelve el conflicto de forma estocástica.

### Para MEMORIA

| Nivel | SSOT Real | ¿Llega al LLM? |
|:---|:---|:---|
| **Texto completo** | `memoryCtx` en `ipc.ts:132` (desde `assembleMemoryPreamble`) | ❌ Descartado |
| **Metadatos** | `usedMemories` en `ipc.ts:133` | ✅ Parcialmente (solo labels, sin values) |
| **Texto formateado** | `formatMemoriesForInjection()` en `PLO:193` | ✅ Pero sin contenido real |

**SSOT real efectiva:** `semantic.json` contiene los datos reales, pero el pipeline los fragmenta en dos objetos y solo el de metadatos llega al LLM, sin los valores que hacen al dato útil.

---

## 8. Mapa de Transformaciones y Pérdidas

```
semantic.json
  │  {assistant: {assistant_name: "Atleta"}, profile: {user_name: {value:"Nahuel"}}}
  │
  ▼ SemanticMemory.load()         [sin pérdida]
  │
  ▼ assembleMemoryPreamble()      [TRANSFORMA]
  │  → preamble: "<assistant_identity>\nassistant_name=Atleta\n...</assistant_identity>\n<user_profile>..."
  │  → usedMemories: [{type:"profile", label:"user name", score:1}, ...]
  │
  ▼ ipc.ts:131-133               [SPLIT]
  │  memoryCtx = preamble         ← texto completo con valores
  │  usedMemories = usedMemories  ← metadatos sin valores
  │
  ▼ ipc.ts:140-155               [PÉRDIDA TOTAL DE memoryCtx]
  │  orchestrate({ memories: usedMemories })
  │  memoryCtx NUNCA SE PASA →→→→→→→→→→→→→→→→→→→→→→→→→→→ ❌ DESCARTADO
  │
  ▼ MemoryPrioritizer.prioritize()  [FILTRA METADATOS]
  │  scored = [{item: {type:"profile", label:"user name", content:undefined}}]
  │
  ▼ formatMemoriesForInjection()    [DEGRADA A LABELS]
  │  content = item.content || item.label → "user name" (no "Nahuel")
  │
  ▼ Layer 4 en prompt final:
     <user_profile>
     - profile: user name [relevance: 42%]   ← sin valor
     </user_profile>
```

---

## 9. Severidad

| Bug | Severidad | Impacto |
|:---|:---|:---|
| `memoryCtx` descartado en `ipc.ts` | 🔴 CRÍTICA | El LLM no recibe ningún dato real de memoria del usuario. La personalización es imposible. |
| `usedMemories` sin `content` en el orquestador | 🔴 CRÍTICA | El formato de inyección solo muestra etiquetas vacías. Los datos existen en disco pero no llegan al modelo. |
| Regex roto en `extractAssistantName` | 🟠 ALTA | Tercer nombre conflictivo (`"Assistant"`) aparece en el focus window en cada turn. |
| Hardcoded `"You are ArgOS"` en constraints | 🟠 ALTA | Colisión irreconciliable con la identidad dinámica. Imposible de sobrescribir sin modificar el código. |
| `"Atleta"` / `"Atlas"` no reconciliados | 🟡 MEDIA | Nombre legacy persiste en disco indefinidamente. `reconciliation.ts` no los detecta. |
| `SYSTEM_PROMPT` en `proxy.ts` letra muerta | 🟡 MEDIA | Falsa sensación de seguridad. Toda la gobernanza de identidad documentada ahí es inoperante. |

---

## 10. Corrección Mínima Recomendada

> [!IMPORTANT]
> Las siguientes correcciones son las de menor superficie de cambio para resolver los bugs críticos.  
> No se implementan aquí — solo se documentan para la siguiente fase.

### Fix #1 — Bug de Memoria (CRÍTICO) — `ipc.ts`

**Problema:** `memoryCtx` se calcula pero nunca se pasa al orquestador.

**Corrección mínima:** Pasar `memoryCtx` como campo adicional o reemplazar el campo `memories` por el texto del preamble.

```typescript
// ANTES (ipc.ts:140-155) — memories recibe solo metadatos
const orchestrationResult = promptOrchestrator.orchestrate({
  memories: usedMemories,         // ← SOLO METADATOS
  // memoryCtx no se pasa
})

// CORRECCIÓN MÍNIMA — usar el preamble real como capa de memoria
const orchestrationResult = promptOrchestrator.orchestrate({
  memories: usedMemories,
  memoryPreamble: memoryCtx,      // ← NUEVO CAMPO: texto completo
})
// + Modificar PLO para inyectar memoryPreamble en lugar de formatMemoriesForInjection
```

### Fix #2 — Colisión de Identidad Hardcoded (ALTO) — `promptLayerOrchestrator.ts:251`

**Problema:** `"You are ArgOS"` hardcoded contradice la identidad dinámica.

**Corrección mínima:** Eliminar o parametrizar la línea 251.

```typescript
// ANTES (PLO:250-252)
<agentic_capabilities>
You are ArgOS, a local cognitive assistant.
${capabilitiesPrompt}

// CORRECCIÓN MÍNIMA
<agentic_capabilities>
${capabilitiesPrompt}
// El nombre ya viene en Layer 3 (assistant-identity)
```

### Fix #3 — Regex roto en `extractAssistantName` (ALTO) — `promptLayerOrchestrator.ts:206`

**Problema:** El método recibe `"Tu nombre es Atleta."` pero busca `"assistant_name:"`.

**Corrección mínima:** Adaptar el regex al formato real del string.

```typescript
// ANTES (PLO:207)
const match = identity.match(/assistant_name[:\s]*([^\n,]+)/)
return match ? match[1].trim() : 'Assistant'

// CORRECCIÓN MÍNIMA
const match = identity.match(/Tu nombre es ([^.]+)\./) 
           || identity.match(/assistant_name[:\s]*([^\n,]+)/)
return match ? match[1].trim() : 'Assistant'
```

### Fix #4 — Reconciliación Incompleta (MEDIO) — `reconciliation.ts:42-45`

**Problema:** "Atlas" y "Atleta" no están en la lista de nombres deprecados.

**Corrección mínima:** Agregar los nombres legacy faltantes.

```typescript
// ANTES (reconciliation.ts:42-45)
const mentionsOldName = valueLower.includes('marta') ||
                        valueLower.includes('rogelia') ||
                        valueLower.includes('santi') ||
                        valueLower.includes('argos')

// CORRECCIÓN MÍNIMA
const mentionsOldName = valueLower.includes('marta') ||
                        valueLower.includes('rogelia') ||
                        valueLower.includes('santi') ||
                        valueLower.includes('argos') ||
                        valueLower.includes('atleta') ||   // ← NUEVO
                        valueLower.includes('atlas')        // ← NUEVO
```

---

## 11. Diagrama de Flujo Consolidado

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FLUJO DE IDENTIDAD                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  semantic.json                                                      │
│    assistant_name: "Atleta"  ──────────────────────────────┐        │
│                                                            │        │
│  constants.ts                                              │        │
│    DEFAULT_SEMANTIC.assistant.assistant_name = "ArgOS"     │        │
│    (fallback si semantic.json vacío)                       │        │
│                                                            ▼        │
│  ipc.ts:149                                                         │
│    assistantIdentity = "Tu nombre es Atleta."              │        │
│                                              ┌─────────────┘        │
│                                              ▼                      │
│  PLO Layer 3: "Tu nombre es Atleta."         ┐ ← LLM lo recibe     │
│  PLO Layer 5: "assistantName: Assistant"     ┤ ← LLM lo recibe     │
│  PLO Layer 6: "You are ArgOS"               ─┘ ← LLM lo recibe     │
│                                 ↑                                   │
│                    TRES IDENTIDADES EN CONFLICTO                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                           FLUJO DE MEMORIA                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  semantic.json                                                      │
│    profile.user_name.value = "Nahuel"                               │
│    profile.preferences.value = "que no me mientan"                  │
│                                     │                              │
│                                     ▼                              │
│  assembleMemoryPreamble()                                           │
│    preamble = "<user_profile>\n- user name: Nahuel\n...</>"         │
│    usedMemories = [{type:"profile", label:"user name", score:1}]   │
│                           │                      │                  │
│                           │                      │                  │
│                    ❌ DESCARTADO          ✅ ENVIADO                │
│                    (memoryCtx)           (usedMemories)             │
│                                                  │                  │
│                                                  ▼                  │
│  PLO Layer 4:                                                       │
│    <user_profile>                                                   │
│    - profile: user name [relevance: 42%]  ← sin valor "Nahuel"     │
│    </user_profile>                                                  │
│                                                                     │
│               MEMORIA EXISTE EN DISCO PERO NO LLEGA AL LLM         │
└─────────────────────────────────────────────────────────────────────┘
```
