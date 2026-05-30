# Voice System

The voice layer provides non-blocking, interruptible Text-To-Speech (TTS) capabilities.

## Architecture
Located in `src/main/voice/`.

### 1. VoiceManager (State Machine)
- Central orchestrator in the Main process.
- State flow: `idle` -> `generating` -> `speaking` -> `idle`.
- Enforces Replace Mode: A new speak request immediately cancels the active generation/playback to prevent overlap.
- Manages config persistence (`voice-config.json`).
- Handles telemetry and IPC distribution.

### 2. Providers (`providers/`)
- Interfaces abstract the TTS engine (`VoiceProvider`).
- `ProviderCapabilities` dictates features like streaming or text limits.
- Currently implemented: `WebSpeechProvider`. Delegates synthesis to the Renderer's native `speechSynthesis` API for zero-dependency execution.

### 3. Speech Preprocessor
- `sanitizeForSpeech`: Strips markdown, URLs, code blocks, and emojis for natural vocalization.
- `segmentForSpeech`: Splits long text at sentence boundaries.

### 4. Renderer Hook (`useVoice.ts`)
- Listens to IPC for `voice:play-text` and executes it.
- Reports back `playback-started`, `playback-ended`, or `playback-error`.
- Performs health checks on `AudioContext` and handles Chromium edge cases.

## Slash Commands
- `/voice on|off`
- `/mute`
- `/unmute`
- `/voice-debug`
