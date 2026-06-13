# Argos — Especificación Técnica (SPEC)

> Documento de referencia técnica del proyecto. Toda decisión arquitectónica relevante debe reflejarse aquí.
> Última actualización: 2026-06-13

---

## Resumen del Proyecto

**Argos** es un widget de escritorio construido sobre Electron + React + Vite. Actúa como asistente de IA local, integrando LLMs vía un proxy local, captura de voz, memoria semántica SQLite, y un sistema de acciones extensible.

---

## Stack Tecnológico

### Runtime & Framework
| Capa | Tecnología | Versión |
|------|-----------|---------|
| Desktop Shell | Electron | 31.0.0 |
| Build Tool | electron-vite | ^2.3.0 |
| UI Framework | React | ^18.3.1 |
| Lenguaje | TypeScript | ^5.5.4 |

### Gestor de Paquetes: pnpm

**Decisión:** El proyecto usa **pnpm** como gestor de paquetes exclusivo.

**Motivación:**
- Evita duplicación de `node_modules` entre proyectos locales (ArgOS, Argos Whisper, etc.) mediante el store global de pnpm.
- Resolución más estricta de dependencias (no permite acceso a paquetes no declarados explícitamente).
- Lockfile más determinístico (`pnpm-lock.yaml`).

**Comandos canónicos del proyecto:**
```bash
pnpm install          # Instalar dependencias
pnpm run build        # Compilar con electron-vite
pnpm run dev          # Modo desarrollo con hot-reload
pnpm start            # Arrancar la aplicación (electron-vite build + electron)
pnpm run rebuild      # Recompilar módulos nativos (better-sqlite3)
```

> ⚠️ **Nota:** No usar `npm install` ni `npm run X`. El lockfile de referencia es `pnpm-lock.yaml`. El archivo `package-lock.json` ha sido eliminado.

### Base de Datos
- **better-sqlite3** `12.10.0` — Persistencia local sincrónica para memoria semántica y perfil de usuario.

### LLM & IA
- Proxy local (Bun/Node, puerto 3000) conectado a LM Studio (puerto 1234).
- Soporte de múltiples proveedores: LMStudioProvider, LocalFallbackProvider.

### Audio & Voz
- **STT (Speech-to-Text):** `MediaRecorderProvider` — Captura de audio vía Web Speech API / `getUserMedia`.
- **TTS (Text-to-Speech):** Web Speech API + proveedores de audio binario.
- **Transcripción offline:** Faster-Whisper (Python, modelo `tiny` descargado en `vendor/whisper/models/`).
- **SoX:** Requerido por `node-record-lpcm16` para captura de micrófono en modo consola.

### UI
- `@xyflow/react` `^12.10.2` — Grafos de flujo para visualización de memoria/agentes.
- `recharts` `^3.8.1` — Gráficos y métricas.
- `zustand` `^5.0.13` — Estado global del renderer.

---

## Arquitectura de Procesos

```
Electron Main Process (Node)
  ├── IPC Handler (ipc.ts)
  ├── LLM Manager (services/llm/)
  ├── Memory Manager (memory/)
  ├── Voice Manager (voice/) [TTS]
  ├── Agent Executor (agent/)
  └── Proxy (proxy.ts) → LM Studio :1234

Electron Renderer Process (React/Vite)
  ├── App.tsx
  ├── components/ (Widget, ChatPanel, VoiceControls, etc.)
  ├── hooks/ (useChat, useVoice)
  └── services/voice/ (VoiceService, MediaRecorderProvider)

Preload (preload/index.ts)
  └── Expone contextBridge API al renderer
```

---

## Variables de Entorno

Ver `.env.example` para la lista completa. Las variables críticas son:

| Variable | Descripción |
|----------|-------------|
| `VITE_PROXY_URL` | URL del proxy local (por defecto `http://localhost:3000`) |
| `LM_STUDIO_URL` | URL del servidor LM Studio (por defecto `http://localhost:1234`) |

---

## Configuración del Build

- **electron-vite** compila Main, Preload y Renderer en paralelo.
- Output: carpeta `out/`
- Packaging: **electron-builder** → `dist/` (NSIS installer para Windows)

---

## Reglas de Desarrollo (SDD)

1. Leer `SPEC.md` y `HANDOFF.md` al inicio de cada sesión antes de modificar código.
2. Actualizar `HANDOFF.md` al finalizar cada sesión con cambios relevantes.
3. Todo comando del proyecto usa `pnpm`. Nunca `npm`.
4. `pnpm-lock.yaml` debe commitearse. `package-lock.json` no debe existir en el repo.
