# Architecture Overview

## Top-Level Design
The application follows a strict Electron Main/Renderer split. The Main process owns all state, disk access, orchestration, and system APIs. The Renderer is a "dumb" visual layer that exclusively requests actions and responds to state changes via IPC.

### Components

#### Main Process (Node)
- **`index.ts` / `window.ts`**: App boot sequence, window management, and crash recovery.
- **`ipc.ts`**: IPC router. Orchestrates proxy calls, intercepts streaming, and injects memory context.
- **`logger.ts`**: Global rotating file logger.
- **Action Registry (`actions/`)**: Parses and dispatches slash commands.
- **Memory System (`memory/`)**: SQLite storage, SQLite-vss for semantic search, profile JSON management.
- **Voice System (`voice/`)**: State machine (idle -> generating -> speaking), provider abstractions.

#### Renderer Process (React/Vite)
- **React Components**: `Widget`, `ChatPanel`, `MessageList`, `VoiceControls`.
- **Custom Hooks**: `useChat` (stream handling), `useVoice` (state + Web Speech API).
- **Styles**: Vanilla CSS variables, BEM naming, floating translucent aesthetic.

#### Local Proxy
- Bun-based local proxy running on port 3000 to interact with external LLMs, masking keys and managing connections.

## Key Design Principles
1. **Stability First**: State machines with timeouts, crash recovery loops, strict typing.
2. **Local-First**: Memory is entirely local SQLite. Proxy handles external traffic.
3. **Opt-in Features**: Voice and auto-speak are off by default.
4. **Separation of Concerns**: Renderer never directly accesses OS resources or memory DBs.
