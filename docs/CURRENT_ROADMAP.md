# Current Roadmap

## Phase 1: Foundation (Completed ✅)
- Solidify IPC boundaries.
- Implement Local SQLite Memory (Semantic + Profile).
- Implement Command / Action Registry.
- Implement Voice State Machine (Web Speech API).

## Phase 2: UX Polish & Cloud TTS (Next)
- Add Cloud TTS Providers (OpenAI, ElevenLabs).
- Support binary IPC audio transmission (`audio-buffer` method).
- Add Voice Selector and Pitch/Speed controls to the UI.
- Implement Text chunking for long TTS generations.

## Phase 3: Engrams & Behavioral Learning
- Add first-class engram model under `src/main/memory/engrams/`.
- Build the isolated Engram Sandbox System defined in `docs/ENGRAM_SANDBOX_SYSTEM.md`.
- Persist behavioral, episodic, semantic, and relational engrams locally.
- Inject compact behavioral directives into the memory preamble.
- Add conservative signal detectors for preference, emotion, contradiction, and reinforcement.
- Consolidate repeated events into abstract behavioral patterns.
- Implement the operational lifecycle, activation scoring, anti-crystallization, and relationship engine defined in `docs/ENGRAM_OPERATIONAL_MODEL.md`.

## Phase 4: Filesystem & Tool Calling
- Sandboxed local filesystem reading capabilities.
- Automated code formatting or analysis via slash commands.
- Initial agentic tool loops strictly gated by confirmations.

## Phase 5: Realtime Interactivity
- Migrate from turn-based chat to persistent Websocket streaming.
- Gemini Live / OpenAI Realtime integration.
- Bidirectional audio (Mic + TTS).
- Interruption engine.
