# VERSION AUDIT — ArgOS 3.1

> Auditoría de versión | 2026-05-30  
> Objetivo: determinar la SSOT (Single Source of Truth) real para la versión del producto.

---

## 1. Fuentes de versión localizadas

| Archivo | Valor de Versión Encontrado | Propósito / Uso |
|:---|:---|:---|
| `package.json` | `"0.1.0"` | Build de Electron, npm, empaquetado |
| `package-lock.json` | `"0.1.0"` | Resolución de dependencias npm |
| `src/main/bootBanner.ts` | `pkg.version ?? '3.1.x'` | Log de inicio en terminal (CLI) |
| `src/main/proxy.ts` | `0.1.0` (hardcodeado) | Prompt de sistema del orquestador proxy |
| `src/cognitive/SelfKnowledgeSubsystem.ts` | `0.1.0` (hardcodeado) | Identidad del sistema cognitivo |
| `src/main/runtimeIntrospection.ts` | `0.1.0` (hardcodeado) | Reporte de estado en memoria |
| `src/renderer/components/WidgetHeader.tsx` | N/A (Solo muestra "Argos") | Interfaz gráfica del usuario (UI) |

---

## 2. Versión efectiva del runtime

Existen **dos realidades paralelas** en el repositorio:
1. **La versión técnica (Build/Electron):** `0.1.0`
   - El ejecutable generado, el instalador (nsis) y los recursos empaquetados operan bajo la versión 0.1.0.
   - El modelo interno de autoconocimiento (`SelfKnowledgeSubsystem`, `runtimeIntrospection`, `proxy`) inyecta `0.1.0` al modelo LLM.
2. **La versión semántica/comercial:** `3.1.x`
   - El fallback en el banner de arranque espera ser `3.1.x`. El usuario y la documentación perciben al sistema como "ArgOS 3.1".

---

## 3. Respuestas específicas a consultas (A, B, C, D)

**A) ¿Qué versión muestra actualmente el banner?**
- **Terminal (bootBanner.ts):** Intenta leer `package.json`. En desarrollo muestra `0.1.0`. Si el path `../../package.json` falla en el empaquetado de producción (donde los archivos están en `app.asar`), cae en el fallback hardcodeado y mostraría `3.1.x`.
- **UI (WidgetHeader.tsx):** La interfaz visual no muestra NINGUNA versión, solo la etiqueta "Argos".

**B) ¿Coincide con package.json?**
- **NO.** El fallback del banner es `3.1.x`, mientras que `package.json` es `0.1.0`.

**C) ¿Coincide con Electron?**
- **Sí y No.** El instalador nativo creado por `electron-builder` utiliza la versión del `package.json` (0.1.0). El usuario instala una app `0.1.0` que él asume es la `3.1`.

**D) ¿Qué versión debería mostrarse al usuario?**
- Debería mostrarse **`3.1.0`** en todos lados, dado que semánticamente el proyecto superó la versión conceptual 3.0 (tal como indica el nombre comercial y el fallback esperado del boot banner).

---

## 4. Versiones Inconsistentes

Actualmente están coexistiendo simultáneamente:
- **`0.1.0`**: En el core técnico (npm, electron, autoconocimiento de IA).
- **`3.1.x`**: En el fallback visual del log del servidor.
- **`3.1`**: En el dominio del problema y definición de producto.

---

## 5. Riesgos

1. **Riesgo Crítico de Auto-Update:** Si se implementa un mecanismo de auto-actualización vía Electron, evaluará `0.1.0`. Una actualización de esquema a `3.1.0` podría generar colisiones insalvables o actualizaciones infinitas.
2. **Riesgo de Metacognición (Alucinación):** El LLM tiene inyectado en múltiples archivos (`proxy.ts`, `SelfKnowledgeSubsystem.ts`) que su versión es la `0.1.0`. Cuando el usuario le pregunte "¿Qué versión eres?", el LLM contestará "0.1.0", contradiciendo la premisa del usuario que espera que responda "3.1".
3. **Riesgo de Build Roto en Producción:** `bootBanner.ts` hace `require('../../package.json')`. En Electron, luego de compilar a `app.asar` en la carpeta `dist`, las rutas relativas subiendo directorios explotan, lo que causará que arroje el fallback (`3.1.x`) ocultando el error real de import.

---

## 6. Recomendación de SSOT (Single Source of Truth)

**Se recomienda establecer `package.json` como la ÚNICA Single Source of Truth (SSOT).**

**Pasos requeridos (como recomendación, NO implementados):**
1. Actualizar `version` en `package.json` de `"0.1.0"` a `"3.1.0"`.
2. Reemplazar los valores de versión hardcodeados (`0.1.0`) en `proxy.ts`, `SelfKnowledgeSubsystem.ts` y `runtimeIntrospection.ts` para que importen o reciban el valor dinámico usando la misma SSOT.
3. Arreglar el import en `bootBanner.ts` usando `app.getVersion()` de Electron en lugar de `require('package.json')`, ya que `app.getVersion()` lee la SSOT de manera segura tanto en dev como en un empaquetado final ASAR.
4. Agregar el número de versión (`3.1.0`) al `WidgetHeader.tsx` para que el usuario pueda validarlo en la interfaz visual.
