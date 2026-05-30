# Known Risks & Technical Debt

## 1. Deprecated Audio APIs
- **ScriptProcessorNode**: `ChatInput.tsx` uses `ScriptProcessorNode` for microphone capture (offline transcription feature). Chromium throws deprecation warnings. This needs migration to `AudioWorkletNode`.

## 2. Memory System Scalability
- **Vector Search**: SQLite-vss handles local brute-force similarity searches well for small datasets (< 10,000 entries). However, if the Vault grows massively, we may need to introduce HNSW indexing or limit search scopes.
- **ONNX Model Overhead**: Loading `all-MiniLM-L6-v2` initially takes ~1-3s and uses ~50-100MB of RAM.

## 3. Web Speech API Quirks
- **Stuck Utterances**: `speechSynthesis` can occasionally hang without throwing an error if it is interrupted abruptly multiple times. A 500ms watchdog exists in `useVoice.ts` to detect this, but it cannot always automatically recover.
- **Voice Loading**: Chromium populates `getVoices()` asynchronously. The first call often returns an empty array.

## 4. UI Rendering Edge Cases
- Unmounted timers: `useChat.ts` and `WidgetHeader.tsx` contain `setTimeout` calls for UI state transitions (`setChatState('idle')`) that are not explicitly cleared on unmount. While mostly benign in a persistent singleton widget, they technically leak.

## 5. OS Integration Quirks
- **GPU Cache on Windows**: Multiple rapid restarts or multiple instances can cause `Gpu Cache Creation failed` in the terminal. This is an Electron/Chromium lock issue but does not affect the user experience.
