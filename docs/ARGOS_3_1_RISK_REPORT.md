# Risk Report - ArgOS 3.1

Informe y clasificación de riesgos técnicos identificados tras la auditoría del sistema de identidad, memoria y capacidades de la versión 3.1.

---

## 1. RIESGOS CRÍTICOS

### CRÍTICO: Pérdida total de datos de memoria contextual (The Mapping Bug)
*   **Impacto**: El sistema de memoria está completamente "ciego" en la conversación real. El asistente no recuerda el nombre del usuario, sus gustos, ni la información almacenada en el Vault.
*   **Causa Raíz**: Bug en [ipc.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/ipc.ts#L140). Se calcula correctamente el string de contexto de memoria (`memoryCtx`), pero al llamar al orquestador se inyecta la variable `usedMemories`, la cual contiene solo metadatos de telemetría (IDs y scores) y carece del valor textual real de los recuerdos.

### CRÍTICO: Inconsistencia y Oscilación de Identidad
*   **Impacto**: El asistente cambia su nombre de manera aleatoria entre turnos o incluso en el mismo mensaje, alternando entre "Argos", "Atlas", "Atleta" u otros nombres legacy del historial.
*   **Causa Raíz**: Colisión lógica de instrucciones. La capa de identidad le dice al modelo *"Tu nombre es Atleta."*, mientras que la capa de restricciones operacionales le indica *"You are ArgOS, a local cognitive assistant."*. Además, al no inyectarse la etiqueta `<assistant_identity>` (debido al bug de mapeo de memoria), el modelo ignora la instrucción de "Fuente Única de Verdad" y adopta nombres antiguos presentes en el historial de chat.

---

## 2. RIESGOS ALTOS

### ALTO: Alucinación de Capacidades Externas (SMS, Llamadas, Terminal)
*   **Impacto**: El modelo afirma haber realizado acciones externas que no posee implementadas (como llamar a personas, enviar SMS o modificar archivos del sistema). 
*   **Causa Raíz**: Contradicción de prompts de red. [proxy.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/proxy.ts#L20) restringe estrictamente el acceso a internet y APIs, mientras que [promptLayerOrchestrator.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/promptLayerOrchestrator.ts#L217) le indica al modelo que *puede* buscar en la web e ingestar videos. Al recibir estas directivas opuestas, el LLM alucina la ejecución imitando respuestas pre-entrenadas.

### ALTO: Timeouts de Generación de Inferencia Local
*   **Impacto**: Caídas frecuentes del sistema conversacional hacia el modo "Degradado/Offline" de emergencia debido a respuestas tardías (timeouts superiores a 30s) en LM Studio.
*   **Causa Raíz**: Modelos locales pesados y falta de políticas dinámicas de ajuste de tiempo de respuesta (TTFT) en la configuración de la API de LM Studio.

---

## 3. RIESGOS MEDIOS

### MEDIO: Split-Brain de Bases de Datos y Estado
*   **Impacto**: Desalineamiento entre ArgOS Core y AGRAx Hub. Cada aplicación accede y escribe en repositorios y archivos SQLite/JSON distintos (`Argos.db` en la unidad `E:\` frente a `knowledge.sqlite` en AppData).
*   **Causa Raíz**: Desacoplamiento de almacenamiento incompleto. No existe un bus de comunicación de base de datos único.

### MEDIO: Filtro Incompleto de Nombres Deprecados en Reconciliación
*   **Impacto**: Nombres legacy como "Atlas" o "Atleta" evaden el script de sanitización al inicio de sesión.
*   **Causa Raíz**: La función de detección de conflictos en [reconciliation.ts](file:///C:/Users/Nahuel/.gemini/antigravity/scratch/widget-ia-toy/src/main/memory/reconciliation.ts#L42) no contempla estos términos específicos, permitiendo que se propaguen de forma persistente.

---

## 4. RIESGOS BAJOS

### BAJO: Warnings de Audio por API Deprecada
*   **Impacto**: Ruido de warnings de desarrollo en consola Chromium.
*   **Causa Raíz**: Uso de `ScriptProcessorNode` en `ChatInput.tsx` para la captura y transcripción de voz local. Requiere migración futura a `AudioWorkletNode`.
