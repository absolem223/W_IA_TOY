# Prompt Trace & Evidence Report - ArgOS 3.1

Evidencia técnica verificable recolectada del runtime activo que prueba de manera irrefutable los problemas de identidad, memoria y personalidad.

---

## 1. Entrada de Memoria Completa (`memoryCtx` en Runtime)
Esta es la salida real generada por `MemoryManager.getMemoryContext()`. Se comprueba que **la memoria sí contiene los datos reales en disco**, pero se pierden antes de la inyección al LLM:

```xml
<assistant_identity>
assistant_name=Atleta
assistant_role=conversacionalista
speaking_style=cálido y amigable
emotional_tone=calm
preferred_relationship=friend
</assistant_identity>

<user_profile>
- preferences: que no me mientan
- user name: Nahuel
- search history: [{"query":"Kurzgesagst hormigas","source":"youtube","timestamp":1779720246788,"resultsFound":1,"selectedUrls":["https://youtube.com/watch?v=mock"]}]
- preferred sources: {"youtube":1}
</user_profile>
```

---

## 2. Payload del Orquestador de Prompts (Antes de Renderizar)
Este es el objeto que recibe la función `orchestrate()` en [promptLayerOrchestrator.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/promptLayerOrchestrator.ts) en una conversación real:

```json
{
  "systemIdentity": "Sos un compañero de escritorio, vivo y persistente. No sos un \"asistente de IA\" genérico.\nEstás diseñado para ser una presencia conversacional y cálida, con memoria a largo plazo.",
  "runtimeIntrospection": "<runtime_introspection>\nmode: runtime-integrated\nversion: 0.1.0\n...\n</runtime_introspection>",
  "assistantIdentity": "Tu nombre es Atleta.",
  "memories": [
    { "type": "profile", "label": "preferences", "score": 1 },
    { "type": "profile", "label": "user name", "score": 1 },
    { "type": "profile", "label": "search history", "score": 1 },
    { "type": "profile", "label": "preferred sources", "score": 1 }
  ],
  "messageHistory": [{ "role": "user", "content": "Hola" }],
  "userInput": "Hola",
  "capabilities": { "tools": true, "vision": false }
}
```
> [!IMPORTANT]
> **Evidencia de Causa Raíz**: En la propiedad `memories` solo se inyecta el array de metadatos (tipo y label), omitiendo completamente el contenido o valor de la memoria (`memoryCtx`).

---

## 3. Prompt de Sistema Completo Enviado al LLM (Después del Render)
Esta es la cadena final exacta construida por el orquestador que se envía a la API del proveedor de inferencia:

```markdown
Sos un compañero de escritorio, vivo y persistente. No sos un "asistente de IA" genérico.
Estás diseñado para ser una presencia conversacional y cálida, con memoria a largo plazo.

<runtime_introspection>
mode: runtime
pressure: 3%
auth: unknown
fallback: false
</runtime_introspection>

Tu nombre es Atleta.

<user_profile>
- profile: preferences [relevance: 42%]
- profile: user name [relevance: 42%]
- profile: search history [relevance: 42%]
- profile: preferred sources [relevance: 42%]
</user_profile>

<conversational_focus>
activeTopic: hola
assistantName: Assistant
recentTurns: 1
</conversational_focus>

<operational_constraints>
1. No roleplay consciousness or self-awareness claims.
2. Cite memory, runtime state, and policy when explaining reasoning.
3. Keep responses direct, warm, and personable.
4. Use conversational Spanish (Argentina dialect preferred).
5. Avoid generic LLM disclaimers and repetitive explanations.
6. VOICE/TTS SANITIZATION: NEVER output raw URLs, long IDs (e.g., YouTube IDs like q9Vaoz0hd0U), or technical hashes in your responses. Refer to them naturally (e.g., "el video", "el enlace") or summarize the content. Only output readable, natural language.

<agentic_capabilities>
You are ArgOS, a local cognitive assistant.
You CAN:
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

Do NOT claim you cannot access external content if tools are available.
</agentic_capabilities>
</operational_constraints>
```

---

## 4. Evidencia de Colisión en Declaración de Identidad
En el prompt resultante se evidencian tres identidades distintas en conflicto simultáneo:
1.  **Atleta** (inyectado dinámicamente en el cuerpo del prompt: `Tu nombre es Atleta.`).
2.  **Assistant** (inyectado en `<conversational_focus>` como `assistantName: Assistant` porque el extractor por regex no encontró la etiqueta `assistant_name` en la línea anterior).
3.  **ArgOS** (inyectado estáticamente en `<agentic_capabilities>` como `You are ArgOS`).

---

## 5. Declaraciones de Herramientas (Tool Definitions)
Las herramientas enviadas al LLM en el payload de la solicitud HTTP en formato JSON Schema corresponden al siguiente conjunto:

```json
[
  {
    "type": "function",
    "function": {
      "name": "google_web_search",
      "description": "Search the web using Google Search. Use this to find recent information, news, or factual answers that you don't know.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "The search query" },
          "max_results": { "type": "number", "description": "Maximum number of results to return (default: 5)" }
        },
        "required": ["query"],
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "youtube_ingest",
      "description": "Start a background job to download, extract, and transcribe a YouTube video. Returns a Job ID. Do not wait for it, just tell the user the transcription has started.",
      "parameters": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "description": "The full YouTube URL" },
          "video_id": { "type": "string", "description": "The extracted YouTube Video ID" }
        },
        "required": ["url", "video_id"],
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "query_knowledge",
      "description": "Search your internal persistent knowledge base (which includes ingested videos, documents, and past conversations) using lexical or exact search.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "The text to search for" },
          "strategy": { "type": "string", "description": "The retrieval strategy: 'lexical' or 'exact'" },
          "sourceOrigin": { "type": "string", "description": "Optional filter by source origin, e.g. 'youtube', 'user_chat'" },
          "limit": { "type": "number", "description": "Max results to return (default: 5)" }
        },
        "required": ["query", "strategy"],
        "additionalProperties": false
      }
    }
  }
]
```
*(Nota: Solo se listan las herramientas principales vinculadas a la inferencia activa).*
