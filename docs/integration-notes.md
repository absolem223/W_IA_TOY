# Integration Notes — Widget IA

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron |
| UI | React + TypeScript |
| Build | electron-vite |
| Bundler | Vite |
| Styles | Vanilla CSS (no frameworks) |

---

## Arquitectura de Proceso

```
Main Process (Electron)
├── window management (frameless, transparent, always-on-top)
├── IPC handlers: resizeWindow, setPanelState, chat:send, chat:token, chat:done
└── AI Provider abstraction (OpenAI / Ollama swappable)

Preload (contextBridge)
└── window.electronAPI — typed bridge, no Node.js exposure

Renderer (React)
├── Widget.tsx — root, manages open/close state, data-bg context
├── WidgetHeader.tsx — drag region, title, toggle
├── ChatPanel.tsx — panel with enter/exit animation
├── MessageList.tsx — throttled scroll, streaming awareness
├── MessageBubble.tsx — delay variants, data-event hooks
└── ChatInput.tsx — focus inertia, disabled state during streaming
```

---

## Variables de Entorno

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # or any compatible model
```

Nunca comitear `.env`. El `.gitignore` lo excluye.

---

## Puntos de Extensión

### Agregar nuevo AI Provider
Implementar la interface `AIProvider` en `src/main/providers/`.
El sistema de chat no necesita cambios.

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
npm run dev        # development with hot reload
npm run build      # production bundle
```

El `.exe` resultante en `dist/win-unpacked/`.
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
