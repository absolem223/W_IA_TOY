# Argos Widget IA

> Widget de escritorio inteligente construido sobre Electron + React + Vite, con integración de LLM local, memoria semántica, captura de voz y sistema de agentes extensible.

---

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/absolem223/widget-ia-toy
cd widget-ia-toy

# 2. Instalar dependencias
pnpm install

# 3. Recompilar módulos nativos (better-sqlite3)
pnpm run rebuild
```

## Requisitos del Sistema

- **Node.js** >= 18
- **pnpm** >= 8 (`npm install -g pnpm`)
- **Python 3.11** con `faster-whisper` instalado (para transcripción offline)
- **SoX** instalado y en PATH (para captura de micrófono vía node-record-lpcm16)
  ```powershell
  choco install sox -y   # Chocolatey
  # o descarga manual: http://sox.sourceforge.net/
  ```
- **LM Studio** corriendo en `http://localhost:1234` con un modelo cargado

## Comandos

| Comando | Descripción |
|---------|-------------|
| `pnpm install` | Instalar dependencias |
| `pnpm run dev` | Modo desarrollo (hot-reload) con electron-vite |
| `pnpm run build` | Compila Main, Preload y Renderer en producción (`out/`) |
| `pnpm start` | Compila en producción y luego inicia la aplicación (`electron .`) |
| `pnpm run shortcut` | Crea un acceso directo en el Escritorio apuntando al proyecto |
| `pnpm run rebuild` | Recompila módulos nativos (`better-sqlite3`) |

## Configuración

Copiar `.env.example` a `.env` y ajustar las variables:

```bash
cp .env.example .env
```

Variables clave:
- `VITE_PROXY_URL` — URL del proxy local (por defecto `http://localhost:3000`)
- `LM_STUDIO_URL` — URL del servidor LM Studio (por defecto `http://localhost:1234`)

## Arquitectura

Ver [`docs/SPEC.md`](docs/SPEC.md) para la especificación técnica completa.
Ver [`docs/HANDOFF.md`](docs/HANDOFF.md) para el estado actual del proyecto y siguientes pasos.

## Stack

- **Electron** 31 + **React** 18 + **TypeScript** 5
- **electron-vite** para build y hot-reload
- **better-sqlite3** para memoria local
- **pnpm** como gestor de paquetes
