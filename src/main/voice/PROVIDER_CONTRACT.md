# Voice Provider Contract

This document outlines the standard contract that any voice provider must implement to integrate with the stabilized Voice Pipeline in `widget-ia-toy`.

---

## 1. The `VoiceProvider` Interface

All custom voice providers must implement the `VoiceProvider` interface defined in `src/main/voice/types.ts`:

```typescript
export interface VoiceProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'local' | 'cloud';

  isAvailable(): Promise<boolean>;
  getVoices(): Promise<VoiceInfo[]>;
  synthesize(text: string, options: SynthesizeOptions): Promise<SynthesizeResult>;
  stop(): void;
  healthCheck(): Promise<HealthCheckResult>;
  getCapabilities(): ProviderCapabilities;
  dispose?(): Promise<void>;
}
```

### Properties

- **`id`**: A unique string identifier for the provider (e.g. `'openai'`, `'gemini'`, `'web-speech'`).
- **`name`**: A user-friendly name displayed in configuration UI/commands (e.g. `'OpenAI TTS'`).
- **`type`**: Either `'local'` (runs on-device, doesn't require network) or `'cloud'` (delegates to external web services).

---

## 2. API Contract details

### `isAvailable(): Promise<boolean>`
Called during initialization and provider enumeration. Returns `true` if the provider has all required local tools, models, or credentials (e.g., checks if environment variables like `OPENAI_API_KEY` are present).

### `getVoices(): Promise<VoiceInfo[]>`
Should return an array of voice configurations supported by this provider:
```typescript
export interface VoiceInfo {
  id: string;
  name: string;
  language: string; // e.g. 'es-AR', 'en-US', or 'multilingual'
}
```

### `synthesize(text: string, options: SynthesizeOptions): Promise<SynthesizeResult>`
Performs the core text-to-speech synthesis.

#### Options Parameter
```typescript
export interface SynthesizeOptions {
  voiceId?: string;
  speed?: number; // 0.5 to 2.0
}
```

#### Return Value (`SynthesizeResult`)
Supported methods of delivery to the renderer:
1. **`audio-buffer` (Cloud/Local PCM)**: The provider returns the raw audio data (typically WAV/MP3) as a `Uint8Array`.
   ```typescript
   {
     method: 'audio-buffer',
     audioBytes: Uint8Array,
     mimeType: 'audio/mp3', // or 'audio/wav'
     durationEstimateMs: 3500 // optional estimate
   }
   ```
2. **`web-speech` (Local Browser-Based)**: The main process delegates speech synthesis directly to Chromium's built-in Web Speech API.
   ```typescript
   {
     method: 'web-speech',
     text: 'Sanitized text to play'
   }
   ```

### `stop(): void`
Must abort any in-flight HTTP requests or PCM generation pipelines immediately. If using `AbortController` internally, calling `stop()` should trigger the abort signal.

### `healthCheck(): Promise<HealthCheckResult>`
Performs a quick diagnostic check (e.g. verifying API credentials reachability) and returns the status:
```typescript
export interface HealthCheckResult {
  available: boolean;
  voiceCount: number;
  error?: string;
}
```

### `getCapabilities(): ProviderCapabilities`
Returns static declarations of the provider features:
```typescript
export interface ProviderCapabilities {
  synthesis: boolean;       // does it support text-to-speech?
  streaming: boolean;       // does it support streaming chunked audio?
  requiresNetwork: boolean; // does it need an internet connection?
  abortable: boolean;       // does it support interrupting synthesis mid-generation?
  maxTextLength: number;    // maximum character count limit (e.g. 4096)
}
```

### `dispose?(): Promise<void>` (Optional)
Called during application shutdown. Use to clean up file handles, abort controller references, or network sockets.

---

## 3. How to Add a New Provider

### Step 1: Create the Provider Class
Create a new file in `src/main/voice/providers/myprovider.ts` and implement the interface:
```typescript
import type { VoiceProvider, VoiceInfo, SynthesizeOptions, SynthesizeResult } from '../types'

export class MyCustomVoiceProvider implements VoiceProvider {
  readonly id = 'myprovider'
  readonly name = 'My TTS Provider'
  readonly type = 'cloud'
  
  // ... implement methods ...
}
```

### Step 2: Register the Provider dynamically
Register the new provider inside `src/main/index.ts` within the `whenReady` boot sequence:
```typescript
    // ── Voice System ──
    appLog.info('Initializing voice system...')
    voiceManager = new VoiceManager(userDataPath, voiceLog)
    await voiceManager.initialize()
    
    // Register built-in OpenAI provider
    if (process.env.OPENAI_API_KEY) {
      const { OpenAIVoiceProvider } = await import('./voice/providers/openai')
      voiceManager.registerProvider(new OpenAIVoiceProvider())
    }
    
    // Register your custom provider
    if (process.env.MY_PROVIDER_API_KEY) {
      const { MyCustomVoiceProvider } = await import('./voice/providers/myprovider')
      voiceManager.registerProvider(new MyCustomVoiceProvider())
    }
```

By decoupling registration from `VoiceManager`, the manager remains a clean, generic orchestrator that depends only on the `VoiceProvider` contract.
