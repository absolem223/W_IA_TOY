# REALITY CHECK — ArgOS 3.1 Harness vs. Repositorio Real

> Auditoría: 2026-05-30 | Auditor: Arquitecto Senior (ArgOS Harness Validator)  
> Nivel de Riesgo General: **HIGH**

---

## Nota sobre ARGOS_HARNESS

> [!CAUTION]
> El directorio `docs/ARGOS_HARNESS/` **no existía** en el repositorio al momento de esta auditoría.  
> Los documentos `ARGOS_TRUTH.md`, `README.md` e `INSTALL.md` referenciados en la solicitud **son inexistentes**.  
> Este directorio fue creado en este acto para alojar el presente informe.  
> Las comparaciones de "archivo esperado vs. encontrado" se realizan contra los valores documentados  
> en las auditorías previas (`IDENTITY_AUDIT.md`, `PROMPT_TRACE.md`, `ARGOS_3_1_RISK_REPORT.md`).

---

## 1. Verificación de Archivos Clave

### `identityLayer.ts`

| Campo | Valor |
|:---|:---|
| **Archivo esperado** | `src/main/memory/identityLayer.ts` |
| **Archivo encontrado** | `src/main/memory/identityLayer.ts` ✓ |
| **Estado** | **OK** |
| **Riesgo** | BAJO — El archivo existe en la ruta correcta. |
| **Acción recomendada** | Ninguna en cuanto a localización. Pendiente: agregar `"Atlas"` y `"Atleta"` como patrones deprecados en `extractAssistantMutation`. |

---

### `promptLayerOrchestrator.ts`

| Campo | Valor |
|:---|:---|
| **Archivo esperado** | `src/main/promptLayerOrchestrator.ts` |
| **Archivo encontrado** | `src/main/promptLayerOrchestrator.ts` ✓ |
| **Estado** | **OK** |
| **Riesgo** | CRÍTICO (funcional, no de localización) — El archivo existe. El bug identificado en auditoría está en la línea 251: hardcodea `"You are ArgOS"` dentro de `<agentic_capabilities>`, en colisión directa con la identidad dinámica. |
| **Acción recomendada** | Ninguna en cuanto a localización. Pendiente: eliminar la línea `You are ArgOS, a local cognitive assistant.` de `defaultConstraints()`. |

---

### `ipc.ts`

| Campo | Valor |
|:---|:---|
| **Archivo esperado** | `src/main/ipc.ts` o `src/main/ipc-channel.ts` |
| **Archivo encontrado** | `src/main/ipc.ts` ✓ (también existe `src/main/ipc.legacy_backup.ts`) |
| **Estado** | **OK** |
| **Riesgo** | CRÍTICO (funcional) — El archivo `ipc-channel.ts` no existe; las auditorías anteriores que lo mencionan hacen referencia a una ruta incorrecta. El archivo real es `ipc.ts`. El bug de mapeo de memoria está en línea 150: se pasa `usedMemories` (array de metadatos) al campo `memories`, cuando `memoryCtx` (el preamble de texto real) **nunca se envía al orquestador**. |
| **Acción recomendada** | Actualizar toda documentación que mencione `ipc-channel.ts` → corregir a `ipc.ts`. |

---

### `proxy.ts`

| Campo | Valor |
|:---|:---|
| **Archivo esperado** | `src/main/proxy.ts` |
| **Archivo encontrado** | `src/main/proxy.ts` ✓ |
| **Estado** | **OK** |
| **Riesgo** | MEDIO — El `SYSTEM_PROMPT` definido en este archivo instruye al LLM a buscar `<assistant_identity>` como fuente de verdad, pero esa etiqueta nunca se inyecta en el prompt final. El `SYSTEM_PROMPT` de `proxy.ts` **no se usa** en el flujo principal (el orquestador en `ipc.ts` construye su propio `systemIdentity` inline, ignorando esta constante). |
| **Acción recomendada** | Evaluar si `SYSTEM_PROMPT` en `proxy.ts` es letra muerta. Si el flujo principal no lo consume, debe eliminarse o integrarse explícitamente. |

---

### `constants.ts`

| Campo | Valor |
|:---|:---|
| **Archivo esperado** | `src/main/constants.ts` (ruta documentada en auditorías) |
| **Archivo encontrado** | `src/main/memory/constants.ts` — **ruta diferente** |
| **Estado** | **MOVED** |
| **Riesgo** | MEDIO — Las auditorías previas (`IDENTITY_AUDIT.md`, línea 9) referencian `src/main/memory/constants.ts` con la ruta correcta. Sin embargo, cualquier documento externo o harness que asuma `src/main/constants.ts` fallará en imports. |
| **Acción recomendada** | Verificar que ningún harness de test o script externo importe desde `src/main/constants.ts`. La ruta canónica es `src/main/memory/constants.ts`. |

---

### `semantic.json`

| Campo | Valor |
|:---|:---|
| **Archivo esperado** | `%APPDATA%\widget-ia-toy\memory\semantic\semantic.json` (runtime, fuera del repo) |
| **Archivo encontrado** | **No existe en el repositorio** — es un archivo de datos de usuario generado en runtime |
| **Estado** | **MISSING (by design, but undocumented)** |
| **Riesgo** | ALTO — El harness diseñado no puede validar el valor de `assistant_name` en `semantic.json` sin levantar la aplicación real o mockear el archivo. Ningún test estático puede cubrir esta ruta. La evidencia del PROMPT_TRACE muestra que contiene `assistant_name=Atleta`, nombre legacy que produce la colisión de identidad. |
| **Acción recomendada** | El harness debe incluir un fixture JSON mockeado en `tests/fixtures/semantic.json` con el valor canónico `ArgOS` para permitir tests determinísticos. |

---

## 2. Comparación: Documentación vs. Estructura Real

| Archivo Referenciado en Docs | Ruta en Docs/Auditorías | Ruta Real Encontrada | Delta |
|:---|:---|:---|:---|
| `identityLayer.ts` | `src/main/memory/identityLayer.ts` | `src/main/memory/identityLayer.ts` | ✅ Match |
| `promptLayerOrchestrator.ts` | `src/main/promptLayerOrchestrator.ts` | `src/main/promptLayerOrchestrator.ts` | ✅ Match |
| `ipc.ts` / `ipc-channel.ts` | `src/main/ipc-channel.ts` (en algunos docs) | `src/main/ipc.ts` | ❌ Nombre incorrecto en docs |
| `proxy.ts` | `src/main/proxy.ts` | `src/main/proxy.ts` | ✅ Match |
| `constants.ts` | `src/main/constants.ts` (en algunos docs) | `src/main/memory/constants.ts` | ❌ Ruta incorrecta en docs |
| `semantic.json` | `%APPDATA%\widget-ia-toy\memory\semantic\` | No está en el repo (runtime) | ⚠️ Archivo de runtime, no versionable |
| `docs/ARGOS_HARNESS/ARGOS_TRUTH.md` | `docs/ARGOS_HARNESS/` | **No existe** | ❌ MISSING |
| `docs/ARGOS_HARNESS/README.md` | `docs/ARGOS_HARNESS/` | **No existe** | ❌ MISSING |
| `docs/ARGOS_HARNESS/INSTALL.md` | `docs/ARGOS_HARNESS/` | **No existe** | ❌ MISSING |
| `scripts/argos_check.py` | `scripts/argos_check.py` | **No existe** | ❌ MISSING |
| `tests/conversations/` | `tests/conversations/` | **No existe** | ❌ MISSING |

---

## 3. Inconsistencias Detectadas

### Inconsistencia #1 — `ipc-channel.ts` vs. `ipc.ts`
- **Descripción**: Al menos un documento de auditoría usa el nombre `ipc-channel.ts`. El archivo real se llama `ipc.ts`. Existe adicionalmente `ipc.legacy_backup.ts` (backup histórico, no activo).
- **Impacto**: Si un futuro harness de test o script de CI intenta importar `ipc-channel.ts`, fallará con `MODULE_NOT_FOUND`.
- **Severidad**: ALTA

### Inconsistencia #2 — `SYSTEM_PROMPT` en `proxy.ts` es letra muerta
- **Descripción**: `proxy.ts` define `SYSTEM_PROMPT` con lógica sofisticada de identidad (`<assistant_identity>` como fuente de verdad). Sin embargo, `ipc.ts` construye su propio `systemIdentity` inline (línea 141) sin referenciar `SYSTEM_PROMPT`. El `SYSTEM_PROMPT` de `proxy.ts` no se usa en el pipeline de chat principal.
- **Impacto**: Toda la lógica de gobernanza de identidad documentada en `proxy.ts` es inoperante en producción.
- **Severidad**: CRÍTICA

### Inconsistencia #3 — `constants.ts` mal referenciada
- **Descripción**: Algunas referencias externas apuntan a `src/main/constants.ts` cuando el archivo real está en `src/main/memory/constants.ts`.
- **Impacto**: Bajo en runtime (el compilador TypeScript lo resuelve), alto en documentación y en cualquier harness que intente leer el archivo por ruta de string.
- **Severidad**: MEDIA

### Inconsistencia #4 — `docs/ARGOS_HARNESS/` no existe
- **Descripción**: La FASE 2.4.1 solicita comparar contra documentos dentro de `docs/ARGOS_HARNESS/`. Ese directorio no existe en el repositorio. Los documentos `ARGOS_TRUTH.md`, `README.md` e `INSTALL.md` son inexistentes.
- **Impacto**: El "Harness ArgOS" referenciado en la solicitud es un diseño conceptual, no un artefacto implementado.
- **Severidad**: ALTA

### Inconsistencia #5 — `tests/conversations/` no existe
- **Descripción**: La FASE 2.5 solicitó crear `tests/conversations/identity.yaml`, `memory.yaml`, `capabilities.yaml`, `runamatic.yaml`. Ninguno existe. El directorio `tests/` solo contiene `cognitive/` y `cognitive-devtools/`, con tests de TypeScript, no YAML.
- **Impacto**: La validación de comportamiento planificada no tiene implementación.
- **Severidad**: ALTA

### Inconsistencia #6 — `scripts/argos_check.py` no existe
- **Descripción**: La solicitud de FASE 2.5 incluye integrar tests a `python scripts/argos_check.py --full`. El archivo no existe en `scripts/`. Los únicos scripts presentes son PowerShell (`.ps1`) y JavaScript (`.js`).
- **Impacto**: El comando de validación global planificado es completamente teórico. No hay runner de tests comportamentales.
- **Severidad**: ALTA

---

## 4. Análisis de `scripts/argos_check.py`

> [!CAUTION]
> **El archivo `scripts/argos_check.py` no existe.**  
> El análisis a continuación es prospectivo, basado en lo que podría ejecutar si existiera.

### Validaciones que PODRÍA ejecutar hoy (si existiera)
- Verificación estática de existencia de archivos clave (`ipc.ts`, `proxy.ts`, etc.) → **ejecutable via `os.path.exists()`**
- Verificación de que `DEFAULT_SEMANTIC.assistant.assistant_name` en `constants.ts` sea `"ArgOS"` → **ejecutable via parsing de texto**
- Verificación de que `DEFAULT_ASSISTANT_PROFILE.assistant_name` en `identityLayer.ts` sea `"Argos"` → **ejecutable via parsing de texto**

### Validaciones que DEPENDEN de rutas que no existen
- Lectura de `semantic.json` (archivo de runtime en `%APPDATA%`) → **requiere entorno levantado**
- Ejecución de los casos YAML en `tests/conversations/` → **directorio no existe**
- Validación del prompt final enviado al LLM → **requiere interceptación de runtime**

### Validaciones actualmente TEÓRICAS
- `python scripts/argos_check.py --full` → **el script no existe**
- Cualquier assertion sobre respuestas del LLM (identidad, memoria, capabilities) → **requiere runtime + modelo activo**
- Validación de que `memoryCtx` se inyecta correctamente → **requiere mock del MemoryManager**

---

## 5. Resumen Ejecutivo

| Categoría | Estado |
|:---|:---|
| Archivos de código fuente auditados | ✅ Todos presentes (con nombres correctos en repo) |
| Consistencia de rutas en documentación | ❌ 2 errores de ruta detectados (`ipc-channel.ts`, `constants.ts`) |
| Harness `docs/ARGOS_HARNESS/` | ❌ No existe (diseño conceptual sin implementar) |
| `scripts/argos_check.py` | ❌ No existe |
| `tests/conversations/` | ❌ No existe |
| `semantic.json` | ⚠️ Archivo de runtime, no versionable, contiene nombre legacy `Atleta` |
| `SYSTEM_PROMPT` en `proxy.ts` activo | ❌ Letra muerta — no se usa en el pipeline principal |

---

## Nivel de Riesgo General

> [!CAUTION]
> ## 🔴 HIGH
>
> **Justificación:**
> - El 60% de los artefactos del "harness" referenciados en la solicitud no existen en el repositorio.
> - El bug crítico de identidad (`SYSTEM_PROMPT` inoperante + colisión de nombres) está confirmado y sin parche.
> - El bug crítico de memoria (`memoryCtx` nunca inyectado al orquestador) está confirmado y sin parche.
> - La infraestructura de validación planificada (argos_check.py, tests/conversations/) es inexistente.
> - ArgOS 3.1 opera en producción sin ninguna cobertura de tests comportamentales.
