# Capability Audit - ArgOS 3.1

Auditoría y clasificación de herramientas disponibles en el ecosistema ArgOS 3.1, investigando por qué el modelo alucina capacidades inexistentes (como llamadas o envío de mensajes).

## Inventario y Clasificación de Herramientas Reales

| Nombre de la Herramienta | Archivo de Registro | Clasificación | Dependencias Internas | Notas de Funcionamiento |
| :--- | :--- | :--- | :--- | :--- |
| `google_web_search` | [retrievalTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/retrievalTools.ts#L11) | **Existe y funciona** | `RetrievalOrchestrator` | Realiza búsquedas mediante Google Search API. |
| `youtube_search` | [retrievalTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/retrievalTools.ts#L40) | **Existe y funciona** | `RetrievalOrchestrator` | Busca videos y canales de YouTube (soporta OAuth). |
| `youtube_ingest` | [multimediaTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/multimediaTools.ts#L6) | **Existe y funciona** | `JobQueue` / `youtubePipeline` | Inicia la descarga y transcripción local en segundo plano. |
| `check_job_status` | [multimediaTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/multimediaTools.ts#L36) | **Existe y funciona** | `JobQueue` | Consulta el estado del job de ingesta de video. |
| `query_knowledge` | [knowledgeTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/knowledgeTools.ts#L8) | **Existe y funciona** | `RetrievalOrchestrator` / `KnowledgeStore` | Búsqueda léxica o exacta en la base de datos `knowledge.sqlite`. |
| `inspect_knowledge_node` | [knowledgeTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/knowledgeTools.ts#L50) | **Existe y funciona** | `KnowledgeStore` (SQLite) | Retorna metadatos y relaciones de un nodo en el grafo. |
| `consolidate_memory` | [knowledgeTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/knowledgeTools.ts#L89) | **Existe y funciona** | `MemoryConsolidator` | Limpia duplicados y aplica decaimiento a la memoria. |
| `set_cognitive_session` | [knowledgeTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/knowledgeTools.ts#L112) | **Existe y funciona** | `CognitiveSessionManager` | Ajusta pesos del RAG según tipo de sesión (coding, creative). |
| `update_intent` | [knowledgeTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/knowledgeTools.ts#L141) | **Existe y funciona** | `CognitiveSessionManager` | Guarda el foco del usuario y objetivos a largo plazo. |
| `ping_tool` | [knowledgeTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/knowledgeTools.ts#L168) | **Existe y funciona** | Ninguna | Herramienta diagnóstica simple de eco. |
| `update_assistant_identity` | [memoryTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/memoryTools.ts#L4) | **Existe y funciona** | `MemoryManager` -> `SemanticMemory` | Persiste mutaciones de nombre y rol en `semantic.json`. |
| `update_user_profile` | [memoryTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/memoryTools.ts#L30) | **Existe y funciona** | `MemoryManager` -> `SemanticMemory` | Guarda preferencias y datos clave del usuario. |
| `google_login` | [googleTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/googleTools.ts#L11) | **Existe y funciona** | `OAuthSessionManager` | Abre flujo OAuth de Google en navegador por puerto local. |
| `google_get_profile` | [googleTools.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/tools/googleTools.ts#L54) | **Existe y funciona** | `OAuthSessionManager` | Consulta API de Google usando tokens OAuth locales. |
| *Llamadas Telefónicas* / *SMS* | N/A | **Declarada pero inexistente** / **Simulada por prompt** | Ninguna | El modelo finge realizarla, pero no hay código ni integraciones. |
| *Modificación de OS / Consola* | N/A | **Declarada pero inexistente** / **Simulada por prompt** | Ninguna | El modelo finge cambiar configuraciones que no posee asignadas. |

---

## Causa Raíz de Alucinaciones de Capacidad

### 1. Instrucciones de Capacidad Contradictorias
En el prompt maestro que se envía al modelo conviven dos directivas opuestas:
1.  **Foco Local Cerrado** ([proxy.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/proxy.ts#L20)): 
    > *"No tenés acceso a internet, buscadores, APIs externas... NUNCA simules haber consultado una fuente externa..."*
2.  **Habilitación de Agentes** ([promptLayerOrchestrator.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/promptLayerOrchestrator.ts#L217)): 
    > *"You CAN: analyze YouTube videos, search the web..."*

Esta contradicción confunde a los modelos ligeros de IA local (`llama-3.2-3b-instruct`) o modelos OpenRouter `:free`. Al no saber qué regla priorizar, el modelo opta por alucinar la ejecución del proceso en lenguaje natural (ej. *"Voy a usar la herramienta web_search para buscar..."*) en lugar de emitir una llamada estructurada de función JSON al motor Electron.

### 2. Falta de Instrucciones de Restricción Negativa
El modelo no cuenta con un bloque de restricciones explícitas sobre lo que **no puede hacer** (ej. *"No tenés capacidad para mandar correos, llamar por teléfono, modificar archivos del sistema ni controlar hardware"*). Por lo tanto, ante preguntas de interacción general, recurre a su pre-entrenamiento estándar que asume que "como asistente inteligente" puede ejecutar cualquier tarea digital simulando los resultados.
