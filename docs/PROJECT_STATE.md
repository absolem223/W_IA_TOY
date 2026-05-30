# Project State: Gestor AC 1.0 (Widget IA Toy)
**Date**: 2026-05-10
**Phase**: Checkpoint & Consolidation

## Summary
The project is a local-first Electron desktop widget providing an AI assistant that lives on the desktop as a floating interface ("Living Stone" aesthetic). It communicates with a local Bun proxy to handle API interactions.

## Current Layer Status

### 1. Presentation Layer (Renderer)
- React + TypeScript + Vite.
- Custom CSS (no Tailwind), floating panel UI.
- Chat interface, Markdown support, memory visualizers, voice controls.

### 2. Action Layer (Main)
- Slash commands system (`/voice`, `/mute`, `/vault`, etc.).
- Robust registry with permission levels and auto-timeout confirmations.

### 3. Memory Layer (Main)
- Local-first file-backed memory system:
  - **Working**: Recent turn buffer and session continuity.
  - **Episodic**: Session/event summaries.
  - **Semantic**: Profile, recurring patterns, stack, and assistant identity.
  - **Vault**: Explicit long-term memories.
  - **Cognitive Layer**: Active topic, recent intents, and context pressure.
- Heuristic retrieval context injection is active.
- Engram-based behavioral learning is now specified in `docs/ENGRAM_ARCHITECTURE.md` and queued for implementation.

### 4. Voice Layer (Main & Renderer)
- TTS state machine.
- Web Speech API integration.
- Configurable settings and telemetry.
- Audio UX with custom indicators.

### 5. Infrastructure
- File-based logging (`app.log`, `proxy.log`, etc.).
- IPC bridge strictly typed.
- Offline STT (Whisper.cpp) pending migration/fixes.

## Next Phase
Ready for Realtime Streaming, Voice Providers (OpenAI, Gemini), and Integrations (Drive/Filesystem).
