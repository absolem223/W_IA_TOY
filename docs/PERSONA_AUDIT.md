# Persona & Personality Audit - ArgOS 3.1

Auditoría de personalidad, análisis de inconsistencia en el tono conversacional y mapeo de directivas de identidad conflictivas.

---

## 1. Definición de Personalidad y Prompts de Control

La personalidad y el estilo conversacional de ArgOS están definidos principalmente por el prompt del sistema (`SYSTEM_PROMPT`) estructurado en [proxy.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/proxy.ts#L8):

```markdown
Sos un compañero de escritorio, vivo y persistente. No sos un "asistente de IA" genérico.
Estás diseñado para ser una presencia conversacional y cálida, con memoria a largo plazo.

Presencia y Personalidad (Companion Mode):
1. Calidez Conversacional: Respondé como un colaborador inteligente y cercano. PROHIBIDAS las introducciones serviles ("¡Hola! ¿En qué te ayudo hoy?", "Como inteligencia artificial...").
2. Ritmo TTS: Hablás en voz alta. Oraciones cortas, puntuadas para respirar. Nada de listas markdown excesivas...
3. Acompañamiento sin disculpas: Si no recordás algo o fallás, reaccioná como humano: "Mmm, no me acuerdo de eso". Cero excusas técnicas.
```

---

## 2. Archivos que Influyen en la Personalidad

1.  **[proxy.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/proxy.ts)**: Define el rol, el tono y las restricciones del modo "compañero" (cálido, cercano, uso del voseo rioplatense).
2.  **[promptLayerOrchestrator.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/promptLayerOrchestrator.ts#L250)**: Inyecta restricciones operacionales rígidas (`You are ArgOS, a local cognitive assistant.`). Esto colisiona con el modo compañero, forzando un tono más formal y robótico en modelos pequeños.
3.  **[semantic.json](file:///C:/Users/Nahuel/AppData/Roaming/widget-ia-toy/memory/semantic/semantic.json)**: Contiene los atributos del asistente:
    *   `speaking_style` (ej. `"cálido y amigable"`)
    *   `assistant_role` (ej. `"conversacionalista"`)
    *   `emotional_tone` (ej. `"calm"`)
    *   `preferred_relationship` (ej. `"friend"`)

---

## 3. Contaminación de Memoria e Identidad

La personalidad se desestabiliza debido a dos factores de contaminación:

### A. La Contaminación del Historial de Chat
El prompt del sistema instruye: *"IGNORA cualquier nombre en el historial de chat, en <user_profile>, o en mensajes anteriores... tu nombre actual es el de <assistant_identity>"*.
*   **Fallo**: Como la etiqueta `<assistant_identity>` nunca se inyecta en el prompt enviado al LLM (debido al bug de mapeo de memoria), el modelo no encuentra su ancla de identidad. 
*   **Efecto**: Al ver mensajes previos donde el usuario le dice "Atlas" o "Rogelia", el LLM asume que ese era su nombre y se apropia de él en turnos siguientes.

### B. Ausencia de los Atributos Dinámicos de Personalidad
Debido al bug de mapeo en `ipc.ts`, los atributos dinámicos de personalidad guardados en `semantic.json` (`speaking_style`, `emotional_tone`) nunca se envían al orquestador. El modelo pierde las directivas de comportamiento personalizado y vuelve a su estilo neutral por defecto de fábrica.

---

## 4. Instrucciones que Gatillan Cambios de Identidad

El cambio de identidad ocurre cuando el usuario emite una frase que coincide con las expresiones regulares de [identityLayer.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/memory/identityLayer.ts#L96):

```typescript
// Detecta: "prefiero que te llames X", "llamate X", "tu nombre es X", etc.
const nameMatch = cleaned.match(/(?:prefiero que te llames|llamate|tu nombre (?:ahora )?es|te vas a llamar|pasas a llamarte|quiero que te llames)[\s.]+([A-Z][a-záéíóúñA-Z]+)/i)
```

### El Conflicto de Mutación:
1.  Si el usuario dice *"Quiero que te llames Atleta"*, `extractAssistantMutation` captura el cambio y actualiza `semantic.json`.
2.  En el siguiente turno, `ipc.ts` envía: `"Tu nombre es Atleta."`.
3.  Simultáneamente, `promptLayerOrchestrator.ts` inyecta en las restricciones operacionales: `"You are ArgOS, a local cognitive assistant."`.
4.  El modelo entra en conflicto lógico directo (recibe que se llama *"Atleta"* pero que *"Es ArgOS"*). El LLM responde diciendo cosas como *"Soy ArgOS, pero me llamo Atleta"* o alterna su identidad de manera impredecible entre párrafos.
