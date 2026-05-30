# Next Steps & Handoff

## Current Status
The project has just reached the end of the **Consolidation & Checkpoint Phase**. The foundation is robust, typed, and well-separated between Main and Renderer. The Action, Memory, and Voice layers are fully implemented in their v1 scope.

## How to Resume Work

### 1. Boot up
```bash
npm install
npm run dev
```

### 2. Verify Systems
- Open the devtools in the widget (Ctrl+Shift+I).
- Type `/voice-debug` to check TTS readiness.
- Type `/memory` to check SQLite and VSS readiness.

### 3. Immediate Priorities for Next Sprint
1. **Cloud TTS Providers**: Implement `OpenAIVoiceProvider` complying with the `VoiceProvider` interface (returning `audio-buffer`).
2. **Audio Worklet Migration**: Fix the `ScriptProcessorNode` deprecation in `src/renderer/components/ChatInput.tsx`.
3. **Voice Settings UI**: Create a visual configuration panel in the Renderer to choose voices and adjust speed/pitch (currently only possible via config files or default slash commands).

## Context Notes
- **Do not use Tailwind**: The project uses vanilla CSS variables and BEM methodology for the "Living Stone" aesthetic.
- **Do not expose Node to Renderer**: Always use `preload/index.ts` and strongly type the bridge in `renderer/env.d.ts`.
- **Do not block the Main thread**: Operations like VSS embeddings or heavy parsing must remain async.
