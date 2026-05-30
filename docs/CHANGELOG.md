# Changelog

## [1.0.0-checkpoint] - 2026-05-10
### Foundation Consolidation

### Added
- **Action Layer**: Slash command registry with modular execution, context injection, and timeout-based confirmation pipelines (`/memory`, `/voice`, etc.).
- **Memory Layer**: SQLite-based dual-memory architecture (`Profile` for explicit facts, `Vault` with `sqlite-vss` for semantic vector search).
- **Voice Layer**: State machine TTS orchestrator with Replace Mode, `WebSpeechProvider`, IPC telemetry, and UI controls.
- **Voice UX**: `sanitizeForSpeech` preprocessing, custom CSS pulse animations, and `/voice-debug` observability.
- **Logging**: Rotating global file logger decoupled from console.

### Changed
- Refactored IPC handlers into `ipc.ts` with strict typed boundaries.
- Replaced monolithic proxy calls with robust streaming `AbortController` handlers.
- UI styling polished for floating "Living Stone" widget constraints.

### Removed
- Extracted old monolithic AI logic (`src/main/ai/*`) into proxy/provider abstractions.
