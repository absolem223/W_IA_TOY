# PATCH PLAN V1 — ArgOS 3.1 Identity & Memory Fixes

> Arquitecto Principal: Diseño de corrección mínima para bugs críticos detectados en auditorías previas.
> NOTA: Este es un diseño técnico. No se ha modificado código.

---

## Bug 1: Amnesia por `memoryCtx` descartado (Bugs A y B)
- **Archivo:** `src/main/ipc.ts`
- **Línea aproximada:** 141-150
- **Causa Raíz:** En `ipc.ts`, se recupera el contexto de memoria validado (`memoryCtx`) desde `MemoryManager`, pero nunca se pasa al `promptLayerOrchestrator`. En su lugar, se inyecta `usedMemories`, un arreglo que contiene solo metadata (labels, type, score) pero carece del `content`. Al orquestar, el prompt inyecta memorias vacías o sin contexto semántico.
- **Cambio mínimo requerido:** 
  Modificar el payload pasado al orquestador en `ipc.ts`. Cambiar `memories: usedMemories` a un objeto que el orquestador pueda interpretar con el texto completo, por ejemplo mapeando `usedMemories` para inyectar el texto, o pasando directamente el preamble:
  ```typescript
  memories: usedMemories.map(m => ({ ...m, content: memoryCtx })) // O ajustar el orquestador para recibir memoryCtx nativo
  ```
- **Riesgo:** Medio. Altera la construcción del prompt del LLM.
- **Impacto esperado:** El asistente recuperará inmediatamente el acceso a sus recuerdos y contexto a largo plazo.

## Bug 2: `extractAssistantName()` vulnerable a inyección legacy (Bug C)
- **Archivo:** `src/main/memory/identityLayer.ts`
- **Línea aproximada:** 96-102
- **Causa Raíz:** La expresión regular captura cualquier nombre propio luego de "llamate" y lo asigna. Esto permite que el LLM o el usuario fuercen identidades conflictivas como "Atlas" o "Atleta", corrompiendo la base de datos de perfil estática.
- **Cambio mínimo requerido:**
  Agregar un filtro explícito para identidades deprecadas dentro del bloque condicional:
  ```typescript
  let rawName = nameMatch[1].trim()
  const lowerName = rawName.toLowerCase()
  if (['atlas', 'atleta', 'agrax'].includes(lowerName)) {
    result.assistant_name = 'Argos' // Fuerza canon
  } else {
    result.assistant_name = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase()
  }
  ```
- **Riesgo:** Bajo. Lógica aislada.
- **Impacto esperado:** Previene la corrupción del perfil y la pérdida de identidad central.

## Bug 3: Hardcode "You are ArgOS" (Bug D)
- **Archivo:** `src/main/promptLayerOrchestrator.ts`
- **Línea aproximada:** 251
- **Causa Raíz:** El método `defaultConstraints()` inyecta estáticamente la frase `"You are ArgOS, a local cognitive assistant."` dentro de la etiqueta `<agentic_capabilities>`. Esto colisiona fatalmente con la Capa 3 (Assistant Identity), provocando que si el usuario lo renombra a "Rodolfo", el prompt diga a la vez "Tu nombre es Rodolfo" y "You are ArgOS".
- **Cambio mínimo requerido:**
  Eliminar la línea 251 del archivo. La responsabilidad de inyectar el nombre es exclusiva de la Layer 3 (`assistantIdentity`).
- **Riesgo:** Bajo.
- **Impacto esperado:** Se elimina la esquizofrenia/bipolaridad en las respuestas del asistente, unificando la fuente de verdad de su nombre.

## Bug 4: Conflicto de Versión 0.1.0 vs 3.1 (Bug E)
- **Archivo:** `package.json`, `src/main/proxy.ts`, `src/cognitive/SelfKnowledgeSubsystem.ts`, `src/main/runtimeIntrospection.ts`
- **Línea aproximada:** package.json:3 y hardcodes en línea ~165 de proxy.ts.
- **Causa Raíz:** Falta de una Single Source of Truth para la versión comercial. 
- **Cambio mínimo requerido:**
  1. Modificar `package.json` a `"version": "3.1.0"`.
  2. Modificar estáticamente `"0.1.0"` por `"3.1.0"` en los archivos TS de instrospección (o mejor aún, reemplazarlos por una llamada a `require('../../package.json').version` o `app.getVersion()`).
- **Riesgo:** Bajo a nivel código, Medio a nivel CI/CD.
- **Impacto esperado:** Coherencia metacognitiva (el LLM sabrá correctamente en qué versión está) y el build generará instaladores con la etiqueta correcta.

---

## Orden recomendado de implementación

1. **Bug 3 (Hardcode "You are ArgOS")**: Es una simple eliminación de 1 línea de texto. Restaura consistencia inmediata.
2. **Bug 2 (Filtro Regex Legacy)**: Previene que futuros inputs corrompan el `semantic.json`.
3. **Bug 1 (Memory Preamble)**: Crítico para la retención, requiere más precisión al mapear el payload.
4. **Bug 4 (Actualización de Versión)**: Tarea final administrativa y de metacognición.

## Riesgo por cambio

- **Alto**: Ninguno.
- **Medio**: Bug 1 (Inyección de memoria puede superar budget de tokens si no se calcula bien el límite del `orchestrator`).
- **Bajo**: Bug 2, 3, y 4. Son cambios de strings aislados y condicionales estáticos.

## Riesgo acumulado

El riesgo general del parche consolidado es **Moderado-Bajo**. Ninguno de los bugs requiere refactorizaciones profundas, cambios de arquitectura de base de datos ni modificación de dependencias. Son simples errores de asignación, lógica regular y strings estáticos.

## Estrategia de rollback

El código no requiere migraciones (el JSON/SQLite absorberá los nombres corregidos si el regex actúa). El rollback se realiza simplemente revirtiendo los 4 commits en Git. La base de datos no se romperá ni corromperá si se realiza un downgrade (stateless fallback).

## Dependencia de Deploy

- **Independientes:** El Bug 4 (Versión) y el Bug 2 (Regex) se pueden arreglar y subir en commits sueltos sin romper el sistema.
- **Deploy conjunto:** Bug 1 (Memory mapping) y Bug 3 (Hardcode de identidad) deberían salir juntos. Si arreglamos solo la memoria sin arreglar la identidad, los recuerdos entrarán en conflicto con la regla estática.
- **Recomendación:** Compilar y lanzar los 4 en una única actualización patch (e.g. `v3.1.1`).
