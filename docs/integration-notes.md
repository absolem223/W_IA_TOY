# Integration Notes — Widget IA

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron |
| UI | React + TypeScript |
| Build | electron-vite |
| Bundler | Vite |
| AI gateway | Local Node proxy + OpenRouter |
| Voice input | Internal WAV recorder + local Whisper.cpp |
| Styles | Vanilla CSS (no frameworks) |

---

## Arquitectura de Proceso

```
Main Process (Electron)
├── window management (frameless, transparent, always-on-top)
├── IPC handlers: resizeWindow, setPanelState, chat:send, chat:token, chat:done
├── embedded local proxy at http://localhost:3000
└── streaming client to that local proxy

Preload (contextBridge)
└── window.electronAPI — typed bridge, no Node.js exposure

Renderer (React)
├── Widget.tsx — root, manages open/close state, data-bg context
├── WidgetHeader.tsx — drag region, title, toggle
├── ChatPanel.tsx — panel with enter/exit animation
├── MessageList.tsx — throttled scroll, streaming awareness
├── MessageBubble.tsx — delay variants, data-event hooks
└── ChatInput.tsx — focus inertia, disabled state during streaming

Local Proxy
├── src/main/proxy.ts — embedded OpenRouter gateway for the desktop app
├── proxy/index.js — standalone proxy for manual debugging
├── dynamic fallback across a small model pool
└── /health endpoint for quick startup checks

Voice Input
├── renderer records 16 kHz mono PCM WAV audio
├── preload sends the audio buffer through IPC
├── main writes a temp WAV file
└── main runs local whisper-cli.exe with a local ggml model
```

---

## Variables de Entorno

```env
API_KEY=sk-or-v1-...
WHISPER_MODEL_FILE=ggml-base.bin
WHISPER_LANGUAGE=es
WHISPER_THREADS=4
```

`API_KEY` es una API key de OpenRouter para chat. La transcripción de voz es completamente local/offline y no usa API keys. Nunca comitear `.env`; el `.gitignore` lo excluye.

---

## Puntos de Extensión

### Engramas y aprendizaje conductual
La evolucion principal de memoria esta definida en `docs/ENGRAM_ARCHITECTURE.md`, el contrato operativo de implementacion esta en `docs/ENGRAM_OPERATIONAL_MODEL.md` y el laboratorio experimental aislado esta en `docs/ENGRAM_SANDBOX_SYSTEM.md`.

La idea base es que una memoria tradicional almacena informacion, mientras que un engrama modifica comportamiento. La implementacion debe apoyarse en las capas actuales (`WorkingMemory`, `SemanticMemory`, `VaultMemory`, `CognitiveLayer`) y agregar una capa dedicada para:
- detectar senales conversacionales;
- reforzar o penalizar patrones;
- consolidar eventos repetidos;
- activar directivas conductuales compactas antes de responder.

Estructura objetivo:

```text
src/main/memory/engrams/
├── types.ts
├── EngramStore.ts
├── EngramActivator.ts
├── EngramDetector.ts
├── EngramConsolidator.ts
├── BehaviorEngine.ts
├── RelationshipEngine.ts
├── AntiCrystallization.ts
├── EmbeddingProvider.ts
└── VectorStore.ts
```

Sandbox experimental objetivo:

```text
src/sandbox/engrams/
├── SandboxRuntime.ts
├── SimulationClock.ts
├── ScenarioRunner.ts
├── EventBus.ts
├── simulation/
├── cognitive/
├── metrics/
├── replay/
├── visualization/
└── datasets/
```

### Agregar o cambiar modelos
Editar `MODEL_POOL` en `proxy/index.js`. El proxy rankea modelos en memoria usando fallos, latencia y último modelo exitoso.

### Voz offline
Ejecutar `npm run setup:whisper` una vez para descargar Whisper.cpp y el modelo local en `vendor/whisper`.

Estructura esperada:

```text
vendor/whisper/bin/whisper-cli.exe
vendor/whisper/models/ggml-base.bin
```

En desarrollo la app usa `vendor/whisper`. En producción `electron-builder` copia esa carpeta a `dist/win-unpacked/resources/whisper`.

Para mejor precisión en español se puede cambiar `WHISPER_MODEL_FILE` a `ggml-small.bin` y volver a ejecutar `npm run setup:whisper`, con mayor costo de RAM/CPU.

### Capa sonora (preparada, no activa)
Los hooks están en el DOM via `data-event`:
- Observar `[data-event="idle-pulse"]` → `animationiteration` event → sync con 6s clock
- Observar `MutationObserver` en `.message-list` → reaccionar a `addedNodes[].dataset.event`

Ver `docs/motion-system.md` para el mapa completo de eventos.

### Nuevas features de UI
Seguir el patrón de timing en `global.css`.
Consultar la guía de uso en el header del archivo CSS antes de agregar nuevas animaciones.

---

## Build Local

```bash
npm run dev        # starts Electron/Vite; app starts its embedded proxy
npm run dev:app    # starts only Electron/Vite
npm run proxy      # starts standalone local OpenRouter proxy for debugging
npm run setup:whisper # downloads local Whisper.cpp runtime/model for offline voice
npm run build      # production bundle
npm run build:local # production bundle + unpacked Windows app
```

El `.exe` resultante queda en `dist/win-unpacked/`.
Usar `launch-dev.bat` para iniciar sin terminal visible.

---

## Problemas Conocidos y Resueltos

| Problema | Solución |
|---|---|
| Focus stealing al arrastrar | `focusable: false` en idle, IPC `setPanelState` al abrir |
| Drag region conflicto con botones | `-webkit-app-region: no-drag` en elementos interactivos |
| Scroll nervioso durante streaming | Throttle de 120ms con `requestAnimationFrame` |
| Desync shadow/border en theme change | `transition: border-color 380ms` en `.widget` |

---

## Stage History

| Stage | Descripción |
|---|---|
| 1-3 | Scaffolding, Electron setup, frameless window |
| 4-6 | Drag & focus stability, IPC architecture |
| 7-8 | Motion vocabulary, idle presence |
| 9-10 | Material system (noise, rim, adaptive shadows) |
| 11 | **System Lock** — visual, motion, interaction finalized |
