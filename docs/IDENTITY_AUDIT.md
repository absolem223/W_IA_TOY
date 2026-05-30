# Identity Audit - ArgOS 3.1

Auditoría detallada de todos los puntos de origen, almacenamiento e inyección de identidad (nombres y roles del asistente) dentro del ecosistema ArgOS 3.1.

## Fuentes de Identidad Detectadas

| Valor | Archivo | Tipo | Uso | Activo | Legacy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ArgOS** | [constants.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/memory/constants.ts#L85) | Código | Nombre por defecto en estructura `DEFAULT_SEMANTIC` | Sí | No |
| **Argos** | [identityLayer.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/memory/identityLayer.ts#L18) | Código | Nombre por defecto en `DEFAULT_ASSISTANT_PROFILE` | Sí | No |
| **ArgOS** | [promptLayerOrchestrator.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/promptLayerOrchestrator.ts#L251) | Código | Hardcodeado en `operational_constraints` ("You are ArgOS") | Sí | No |
| **Atleta** / **Atlas** | `%APPDATA%\widget-ia-toy\memory\semantic\semantic.json` | DB/JSON | Valor actual cargado de la base de datos semántica del usuario | Sí | Sí |
| **Atlas** | [SESSION_HANDOFF.md](file:///E:/Argos%203.0/SESSION_HANDOFF.md) | Documento | Registrado como conflicto de identidad heredado del widget | No | Sí |
| **Rogelia** | [reconciliation.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/memory/reconciliation.ts#L43) | Código | Patrón de búsqueda de nombres deprecados en reconciliación | No | Sí |
| **Marta** | [reconciliation.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/memory/reconciliation.ts#L42) | Código | Patrón de búsqueda de nombres deprecados en reconciliación | No | Sí |
| **Santi** | [reconciliation.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/memory/reconciliation.ts#L44) | Código | Patrón de búsqueda de nombres deprecados en reconciliación | No | Sí |
| **AGRAx** | [ARCHITECTURE_DIRECTION.md](file:///E:/Argos%203.0/ARCHITECTURE_DIRECTION.md) | Documento | Prefijo para denominar componentes del Hub de escritorio (`AGRAx Hub`) | Sí | No |

---

## Análisis Técnico de Conflictos de Identidad

### 1. Inexistencia de la Etiqueta XML de Identidad
El prompt del sistema (`SYSTEM_PROMPT` en [proxy.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/proxy.ts)) establece una regla estricta:
> *"Tu nombre canónico está en `<assistant_identity>` como assistant_name. Esa etiqueta es la única fuente de verdad. IGNORA cualquier nombre en el historial..."*

Sin embargo, debido a un fallo en la orquestación de prompts, la etiqueta `<assistant_identity>` **nunca se inyecta** en el prompt que va al LLM. El LLM se ve obligado a buscar una etiqueta inexistente, provocando que ignore la regla de "Fuente única de verdad".

### 2. Inyección de Múltiples Identidades en Capas
Al LLM se le envían simultáneamente dos instrucciones contradictorias en el mismo prompt:
*   **Capa de Identidad del Asistente** ([ipc.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/ipc.ts#L149)): Inyecta `"Tu nombre es [assistant_name]."` (donde el nombre es tomado de `semantic.json`, ej. `"Atleta"` o `"Atlas"`).
*   **Capa de Restricciones Operacionales** ([promptLayerOrchestrator.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/promptLayerOrchestrator.ts#L251)): Inyecta `"You are ArgOS, a local cognitive assistant."`.

Esto fragmenta la autopercepción del modelo, haciéndolo oscilar entre nombres de sesión en sesión.

### 3. Vacío de Reconciliación para Nombres Legacy
El script de reconciliación ([reconciliation.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/memory/reconciliation.ts)) detecta y depreca "Marta", "Rogelia", "Santi" y "Argos" dentro del perfil del usuario, pero **no incluye reglas para deprecación de "Atlas" o "Atleta"**. Por lo tanto, si la base de datos semántica del usuario almacena un nombre legacy bajo `assistant_name` o en las preferencias, el conflicto persistirá infinitamente en cada inicio.
