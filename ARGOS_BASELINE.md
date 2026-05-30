# ArgOS Platform 3.2 — Baseline Stable (Fase 0 — SSOT Lockdown)

Este documento certifica la consolidación de la línea base estable (baseline) de **ArgOS Platform 3.2** (Phase 2.5 Core) previa a la implementación de la infraestructura de aprovisionamiento de la Fase 3.

---

## 1. Metadatos de la Baseline
*   **Fecha de Cierre:** 2026-05-30
*   **Rama de Trabajo:** `main`
*   **Commit Remoto Base (GitHub origin/main):** `2175fe85d97e42dc29937d824f4d665fd014c6cd` ("Stage 12 — Security baseline: env handling and API key protection")
*   **Tag Asignado:** `pre-argos-platform-3.2`
*   **Repositorio Remoto:** `https://github.com/absolem223/W_IA_TOY.git`

---

## 2. Purgado de Binarios y Seguridad de Repositorio (SSOT Lockdown)
*   **Resolución de Archivos Pesados:** Se ha reestructurado el repositorio local eliminando el binario pesado de Whisper (`vendor/whisper/models/ggml-base.bin`, ~141 MB) que bloqueaba físicamente el push a GitHub por superar los 100 MB.
*   **Ajustes en `.gitignore`:** Se ha añadido una regla de bloqueo explícito y permanente para evitar el rastreo accidental de binarios y modelos compilados locales:
    ```gitignore
    # Binarios y Modelos (Whisper)
    vendor/
    *.bin
    *.dll
    *.exe
    ```

---

## 3. Estado de Verificación y Estabilidad
Todos los controles de calidad locales han sido ejecutados con éxito absoluto sobre el código fuente antes de realizar el commit y el tag de baseline:

1.  **Chequeo de Tipos (TypeScript):**
    ```bash
    npm run typecheck
    ```
    *   **Resultado:** **Exitoso (PASS)**. Cero errores de transpilación en las capas main, preload y renderer.
2.  **Compilación en Producción:**
    ```bash
    npm run build
    ```
    *   **Resultado:** **Exitoso (PASS)**. Transpilación limpia a través de `electron-vite build` generando los recursos en `out/main`, `out/preload` y `out/renderer`.
3.  **Suite de Pruebas Cognitivas y Robustez del Runtime:**
    ```bash
    npm run test:cognitive
    ```
    *   **Resultado:** **Exitoso (PASS)**. Se ejecutaron y pasaron todas las pruebas unitarias y de integración del runtime cognitivo:
        *   `core.test.ts` (Activación de contexto, degradación, adaptación conductual, etc.)
        *   `observability.test.ts` (Métricas de reflexión avanzadas y telemetría)
        *   `metacognition.test.ts` (Motor de contradicción de confianza, Playwright adapter)
        *   `stability.test.ts` (Consolidación de memoria semántica, snapshots)
        *   `selfknowledge.test.ts` (Conciencia de restricciones de contexto y reportero de estado)
        *   `recovery.test.ts` (Recuperación de sesión ante caídas y re-ejecución de herramientas)
        *   `hardening.test.ts` (Resiliencia ante JSON malformado del modelo, Safe Mode con backups `.bak` por re-crashes sucesivos o recursión descontrolada, e IPC backpressure)

---

## 4. Componentes Clave Consolidados (Línea Base)

### A. Sistema de Doble Memoria (Dual-Memory System)
*   **Working & Semantic Memory:** Estructuración de la base de datos sqlite local en la capa principal de Electron para persistencia de recuerdos, engramas y reconciliación semántica.
*   **Identidad y Resguardo de Personalidad:** Conservación estricta de la personalidad e identidad del agente en el ciclo de turnos de chat.

### B. Pipeline de Voz Novedoso (Voice Pipeline)
*   **VoiceManager & TTS/STT:** Soporte estructurado para interfaces de voz y transcripción (Whisper), adaptando la carga bajo demanda y evitando binarios embebidos rígidos.

### C. Motor del Agente (Agent Executor & Recovery)
*   **AgentExecutor.ts:** Manejo asíncrono del flujo de pensamiento del agente, orquestación de llamadas a herramientas, y control transaccional de estados.
*   **Resiliencia y Safe Mode:** Mecanismo automático para resguardar la sesión activa del usuario ante crashes violentos del LLM o desbordamientos de recursión, aislando la sesión en formato `.json.bak` y activando un Modo Seguro restrictivo que protege al sistema.

---

Este commit consolida de forma definitiva el código fuente estable de la aplicación, definiendo el punto de partida oficial para las tareas de aprovisionamiento, instalador e integración en la nube correspondientes a **ArgOS 3.2**.
