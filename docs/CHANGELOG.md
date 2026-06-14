# Changelog

## [1.1.0-checkpoint] - 2026-06-02
### Voice Architecture Decoupling (Phase 1)

### Added
- **Central Configuration**: Created `src/config/voice.ts` to manage voice provider selection centrally.
- **Voice Context & Hooks**: Created `VoiceContext.tsx` to handle application-wide `VoiceService` lifecycle, instantiated at the root via React Context, and exposed through a clean `useVoiceService()` hook.
- **Global Provider Wrapper**: Wrapped the main application `Widget` with `VoiceProviderComponent` inside `App.tsx`.

### Changed
- **ChatInput Refactoring**: Removed all concrete imports of `DummyProvider` and direct instantiation. `ChatInput` now depends exclusively on `useVoiceService()` and the abstract `VoiceService` API.
- **Micro-Recording Elimination**: Extracted the duplicate/legacy `MediaRecorder` inline capturing code, making `ChatInput` pure and ready for multi-provider registration.

### Removed
- **Environment Flags**: Deleted `DEV_DUMMY_VOICE` flag and duplicate inline state mapping within `ChatInput.tsx`.

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
