# Memory Audit - ArgOS 3.1

Auditoría detallada del ciclo de vida de la memoria local, persistencia, mecanismos de recuperación y el análisis del fallo estructural de mapeo que causa la pérdida de datos del perfil y recuerdos en el prompt del sistema.

---

## 1. El Ciclo de Memoria Completo

### A. Ingesta de Datos
El ingreso de información a la memoria ocurre por tres vías:
1.  **Explícita por Comando**: El usuario ejecuta `/profile set <key> | <value>` o `/vault add <topic> | <content>`.
2.  **Transaccional conversacional**: En cada turno de chat (`chat:send`), se registra el mensaje en la memoria de trabajo activa (`workingMemory`).
3.  **Reflexión Cognitiva (Inferencia)**: Tras alcanzar un umbral de turnos (8 a 20 turnos), el sistema gatilla un proceso de reflexión en segundo plano para consolidar patrones conceptuales y deducir preferencias del usuario, guardándolos en la capa semántica.

### B. Persistencia
*   **Destino físico**: `%APPDATA%\widget-ia-toy\memory\`
*   **Mecanismo de escritura**: Modificación en memoria RAM debounceada (espera 1s tras cambios) que escribe en disco de forma atómica usando un archivo temporal `.tmp` y renombrándolo al destino definitivo (evita corrupción ante apagados repentinos).
*   **Archivos Clave**:
    *   [session.json](file:///C:/Users/Nahuel/AppData/Roaming/widget-ia-toy/memory/working/session.json): Memoria de trabajo (chat activo).
    *   [semantic.json](file:///C:/Users/Nahuel/AppData/Roaming/widget-ia-toy/memory/semantic/semantic.json): Perfil del usuario, stack tecnológico, configuración de identidad.
    *   [episodic.json](file:///C:/Users/Nahuel/AppData/Roaming/widget-ia-toy/memory/episodic/episodic.json): Resúmenes de sesiones conversacionales pasadas.
    *   `vault/index.json` y `vault/entries/*.md`: Memorias declarativas guardadas explícitamente.

### C. Reinicio (Safe Boot & Recovery)
Al arrancar, `MemoryManager` recupera archivos `.tmp` huérfanos de caídas previas y carga los JSON en caché. El motor corre un ciclo de reconciliación inicial para corregir y unificar identidades antes de la primera interacción.

---

## 2. El Mecanismo de Recuperación y Búsqueda (Retrieval)

Durante un turno de chat, `MemoryManager.getMemoryContext()` ejecuta la búsqueda de coincidencia léxica:
1.  **Tokenización de palabras clave**: Remueve stopwords (preposiciones y conectores) del último mensaje del usuario.
2.  **Cálculo de Relevancia (Scoring)**:
    *   **Coincidencia léxica directa** en claves del perfil de usuario y títulos de Vault.
    *   **Ponderador de Confianza**: Multiplica por 1.0 (alta), 0.7 (media) o 0.4 (baja).
    *   **Ponderador Temporal**: Aplica decaimiento sobre entradas antiguas (recency boost).
3.  **Ensamblaje del Contexto (`memoryCtx`)**: Genera un string formateado con bloques XML para el LLM:
    *   `<assistant_identity>`: Valores del asistente (`assistant_name`, `speaking_style`).
    *   `<user_profile>`: Pares de clave-valor del perfil del usuario.
    *   `<relevant_memories>`: Fragmentos coincidentes del Vault.
    *   `<attention_state>`: Foco de atención y objetivos activos.

---

## 3. CAUSA RAÍZ DEL FALLO DE RECUPERACIÓN (The Mapping Bug)

El sistema de memoria **falla sistemáticamente** al recordar nombres de usuario, preferencias o hechos guardados en el Vault debido a un **error grave de mapeo en el canal de IPC** ([ipc.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/ipc.ts)):

```typescript
// 1. Se genera la memoria completa en texto plano (incluye los valores reales de perfil y recuerdos)
const memoryResult = memoryManager?.getMemoryContext(lastUserMsg?.content || '')
const memoryCtx = memoryResult?.preamble || '' // <-- CONTIENE EL TEXTO CON VALORES
const usedMemories = memoryResult?.usedMemories || [] // <-- CONTIENE SOLO METADATOS (label, score, type)

// 2. Se envía la información al orquestador de prompts
const orchestrationResult = promptOrchestrator.orchestrate({
  ...
  memories: usedMemories, // <-- ERROR: Se inyecta la lista de metadatos, NO EL CONTENIDO REAL (memoryCtx)
  ...
})
```

### Consecuencia en el Prompt del LLM:
El orquestador de capas recibe un array de metadatos (como `[{ type: "profile", label: "user_name", score: 1 }]`) y lo formatea usando su función interna `formatMemoriesForInjection`:

```markdown
<user_profile>
- profile: user name [relevance: 100%]
- profile: preferences [relevance: 100%]
</user_profile>
```

**El modelo de lenguaje nunca recibe los valores asociados (`"Nahuel"`, o `"que no me mientan"`).** El LLM solo se entera de que *existen* esas claves en su base de conocimiento, pero al no tener el contenido real, se ve forzado a alucinar o ignorar la existencia de datos aprendidos.
