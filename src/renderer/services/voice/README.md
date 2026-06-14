# Argos Voice Service

Arquitectura de dictado por voz desacoplada del motor de chat y del sistema TTS existente.

## Propósito

Este módulo define la capa de abstracción para captura de audio → transcripción → entrega de texto.
Es completamente independiente de:

- El pipeline de chat (`useChat`, IPC de LLM)
- El sistema TTS (`useVoice`, VoiceManager, WebSpeechProvider)
- El backend (main process, proxy)

El objetivo es permitir integrar cualquier motor STT (Speech-to-Text) en el futuro cambiando únicamente el provider, sin tocar la UI ni el pipeline de chat.

---

## Estructura

```
src/renderer/services/voice/
├── types.ts              → VoiceState, VoiceProvider (interfaz), tipos auxiliares
├── VoiceProvider.ts      → BaseVoiceProvider (clase abstracta opcional)
├── VoiceService.ts       → Orquestador central, maneja suscripciones
├── index.ts              → Barrel export (API pública)
├── providers/
│   └── DummyProvider.ts  → Provider de testing sin micrófono ni red
└── README.md             → Esta documentación
```

---

## Flujo de eventos

```
Consumer (ChatInput / hook)
  │
  ├─ voiceService.start()
  │      │
  │      └─► Provider.start()
  │               │
  │               ├─ emit: state → 'recording'
  │               ├─ emit: state → 'transcribing'
  │               ├─ emit: partialTranscript → "texto parcial..."
  │               ├─ emit: state → 'processing'
  │               ├─ emit: state → 'generating'
  │               └─ emit: finalTranscript → "texto final completo"
  │
  ├─ subscribeState(cb)            → reaccionar a cambios de estado en la UI
  ├─ subscribePartialTranscript(cb) → mostrar texto en tiempo real (futuro)
  └─ subscribeFinalTranscript(cb)  → enviar al pipeline de chat
```

---

## Cómo agregar un nuevo provider

1. Crear un archivo en `providers/NombreProvider.ts`
2. Extender `BaseVoiceProvider` o implementar `VoiceProvider` directamente
3. Implementar `start()`, `stop()`, y emitir estados con los helpers protegidos:
   - `this._emitStateChange('recording')`
   - `this._emitPartialTranscript('...')`
   - `this._emitFinalTranscript('...')`
4. Exportar desde `index.ts`
5. Pasar al `VoiceService` en el constructor o via `setProvider()`

### Ejemplo mínimo

```typescript
import { BaseVoiceProvider } from '../VoiceProvider'

export class MyProvider extends BaseVoiceProvider {
  readonly id = 'my-provider'

  async start(): Promise<void> {
    this._emitStateChange('recording')
    // ... captura real de audio ...
    this._emitStateChange('transcribing')
    // ... llamada a motor STT ...
    this._emitFinalTranscript(transcribedText)
    this._emitStateChange('idle')
  }

  async stop(): Promise<void> {
    // ... detener captura ...
    this._emitStateChange('idle')
  }
}
```

---

## Cómo integrar Whisper.cpp en el futuro

### Opción A — Whisper.cpp vía HTTP (servidor local)

1. Levantar `whisper-server` en un puerto local (ej. `localhost:8178`)
2. Crear `providers/WhisperCppProvider.ts`
3. En `start()`: abrir `MediaRecorder`, acumular chunks, en `onstop` enviar WAV vía `fetch` al servidor
4. Parsear respuesta JSON y emitir `_emitFinalTranscript(response.text)`

```typescript
// Estructura aproximada
async start() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  // ... acumular chunks ...
  recorder.onstop = async () => {
    const wavBuffer = await convertToWav(chunks)
    const res = await fetch('http://localhost:8178/inference', {
      method: 'POST',
      body: wavBuffer,
    })
    const { text } = await res.json()
    this._emitFinalTranscript(text)
  }
}
```

### Opción B — Whisper.cpp vía IPC (Electron subprocess)

1. En el Main process, levantar `whisper-cpp` como child process
2. Agregar IPC handlers: `voice:transcribe-whisper`
3. En el provider, llamar `window.electronAPI.transcribeWhisper(wavBuffer)`
4. Este path ya existe parcialmente en `ChatInput.tsx` via `electronAPI.transcribeAudio`

### Opción C — Faster Whisper (Python subprocess)

Igual que B pero el subprocess es un script Python con Faster Whisper.
El IPC es el mismo; solo cambia la implementación del subprocess en Main.

---

## Notas de diseño

- **VoiceService es stateful**: mantiene `_currentState` sincronizado con el provider.
- **Múltiples suscriptores**: cada `subscribe*()` soporta N listeners simultáneos.
- **Hot-swap de provider**: `setProvider()` permite cambiar el engine en runtime sin remontar componentes.
- **Sin dependencias externas**: todo el módulo funciona con TypeScript puro.
- **Separación de TTS y STT**: este módulo maneja únicamente dictado (STT). El TTS sigue viviendo en `useVoice.ts` + `VoiceManager` del Main process.
