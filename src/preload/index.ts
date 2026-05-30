import { contextBridge, ipcRenderer } from 'electron'
import type { ChatMessage } from '../shared/types'
import type { RuntimeStatusReport } from '../shared/runtime'

console.log('PRELOAD OK: Script has executed.');

// Exposes a minimal, typed surface to the renderer.
// Nothing from Node/Electron leaks beyond this file.
contextBridge.exposeInMainWorld('electronAPI', {
  sendMessages: (messages: ChatMessage[], requestId: number) =>
    ipcRenderer.send('chat:send', messages, requestId),

  // Layout: controls window geometry
  resizeWindow: (height: number) =>
    ipcRenderer.send('widget:resize', height),

  // Interaction: controls focus/input state — intentionally separate from resize
  setPanelState: (isOpen: boolean) =>
    ipcRenderer.send('widget:panel-state', isOpen),

  // Stream cancellation — carries requestId so ipc.ts can reject stale cancels
  cancelChat: (requestId: number) =>
    ipcRenderer.send('chat:cancel', requestId),

  // Application lifecycle
  quitApp: () => ipcRenderer.send('app:quit'),

  // Offline voice transcription; implemented in the main process via Whisper.cpp.
  transcribeAudio: (audioBuffer: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke('voice:transcribe', audioBuffer, mimeType),

  onStart: (cb: (requestId: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, requestId: number) => cb(requestId)
    ipcRenderer.on('chat:start', handler)
    return () => ipcRenderer.removeListener('chat:start', handler)
  },

  onToken: (cb: (requestId: number, token: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, requestId: number, token: string) => cb(requestId, token)
    ipcRenderer.on('chat:token', handler)
    return () => ipcRenderer.removeListener('chat:token', handler)
  },

  onAbort: (cb: (requestId: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, requestId: number) => cb(requestId)
    ipcRenderer.on('chat:abort', handler)
    return () => ipcRenderer.removeListener('chat:abort', handler)
  },

  onDone: (cb: (requestId: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, requestId: number) => cb(requestId)
    ipcRenderer.on('chat:done', handler)
    return () => ipcRenderer.removeListener('chat:done', handler)
  },

  onError: (cb: (requestId: number, msg: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, requestId: number, msg: string) => cb(requestId, msg)
    ipcRenderer.on('chat:error', handler)
    return () => ipcRenderer.removeListener('chat:error', handler)
  },

  onProxyStatus: (cb: (status: 'connecting' | 'connected' | 'unavailable') => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: 'connecting' | 'connected' | 'unavailable') => cb(status)
    ipcRenderer.on('proxy:status', handler)
    return () => ipcRenderer.removeListener('proxy:status', handler)
  },

  getRuntimeStatus: () => ipcRenderer.invoke('runtime:get-status'),

  onRuntimeStatus: (cb: (status: RuntimeStatusReport) => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: RuntimeStatusReport) => cb(status)
    ipcRenderer.on('runtime:status', handler)
    return () => ipcRenderer.removeListener('runtime:status', handler)
  },

  onContextObservability: (cb: (metrics: any) => void) => {
    const handler = (_: Electron.IpcRendererEvent, metrics: any) => cb(metrics)
    ipcRenderer.on('context:observability', handler)
    return () => ipcRenderer.removeListener('context:observability', handler)
  },

  onPromptPreview: (cb: (preview: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, preview: string) => cb(preview)
    ipcRenderer.on('runtime:prompt-preview', handler)
    return () => ipcRenderer.removeListener('runtime:prompt-preview', handler)
  },

  openDevtools: () => ipcRenderer.send('devtools:open'),

  memoryDelete: (id: string) =>
    ipcRenderer.invoke('memory:delete-vault', { id }),

  memoryGetVault: () =>
    ipcRenderer.invoke('memory:get-vault'),

  memoryGetProfile: () =>
    ipcRenderer.invoke('memory:get-profile'),

  memoryUpdateProfile: (key: string, value: string | string[]) =>
    ipcRenderer.invoke('memory:update-profile', { key, value }),

  memoryMigrate: (messages: ChatMessage[]) =>
    ipcRenderer.invoke('memory:migrate-data', { messages }),

  memoryGetStatus: () =>
    ipcRenderer.invoke('memory:get-status'),

  onMemorySaved: (cb: (data: { id: string; title: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { id: string; title: string }) => cb(data)
    ipcRenderer.on('memory:saved', handler)
    return () => ipcRenderer.removeListener('memory:saved', handler)
  },

  onMemorySync: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('memory:sync', handler)
    return () => ipcRenderer.removeListener('memory:sync', handler)
  },

  onMigrationOffer: (cb: (data: { messageCount: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { messageCount: number }) => cb(data)
    ipcRenderer.on('memory:migration-offer', handler)
    return () => ipcRenderer.removeListener('memory:migration-offer', handler)
  },

  onMemoryUsed: (cb: (requestId: number, memories: Array<{ type: string; label: string; score: number }>) => void) => {
    const handler = (_: Electron.IpcRendererEvent, requestId: number, memories: Array<{ type: string; label: string; score: number }>) => cb(requestId, memories)
    ipcRenderer.on('chat:memory-used', handler)
    return () => ipcRenderer.removeListener('chat:memory-used', handler)
  },

  onCognitiveState: (cb: (state: { activeTopic: string | null; contextPressure: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: { activeTopic: string | null; contextPressure: number }) => cb(state)
    ipcRenderer.on('chat:cognitive-state', handler)
    return () => ipcRenderer.removeListener('chat:cognitive-state', handler)
  },

  onAgentLoop: (cb: (data: any) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('agent:loop', handler)
    return () => ipcRenderer.removeListener('agent:loop', handler)
  },

  onAgentStatus: (cb: (status: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: string) => cb(status)
    ipcRenderer.on('agent:status', handler)
    return () => ipcRenderer.removeListener('agent:status', handler)
  },

  onToolApprovalRequested: (cb: (data: { toolName: string, capabilities: string[] }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { toolName: string, capabilities: string[] }) => cb(data)
    ipcRenderer.on('agent:tool-approval-requested', handler)
    return () => ipcRenderer.removeListener('agent:tool-approval-requested', handler)
  },

  sendToolApprovalResponse: (toolName: string, approved: boolean) =>
    ipcRenderer.send('agent:tool-approval-responded', { toolName, approved }),

  // ── Action Layer ──
  actionExecute: (rawCommand: string) =>
    ipcRenderer.invoke('action:execute', rawCommand) as Promise<{ success: boolean; message: string; data?: Record<string, unknown> }>,

  // ── Voice Layer ──
  voiceRendererReady: () =>
    ipcRenderer.send('voice:renderer-ready'),

  voiceSpeak: (text: string) =>
    ipcRenderer.invoke('voice:speak', { text }) as Promise<{ success: boolean; error?: string }>,

  voiceStop: () =>
    ipcRenderer.invoke('voice:stop'),

  voiceGetStatus: () =>
    ipcRenderer.invoke('voice:get-status') as Promise<{
      state: string; enabled: boolean; muted: boolean;
      currentProvider: string; currentVoiceId: string;
      currentText?: string; currentRequestId?: string;
    }>,

  voiceGetVoices: () =>
    ipcRenderer.invoke('voice:get-voices') as Promise<Array<{ id: string; name: string; language: string }>>,

  voiceSetConfig: (config: { enabled?: boolean; muted?: boolean; voiceId?: string; speed?: number; providerId?: string }) =>
    ipcRenderer.invoke('voice:set-config', config),

  onVoiceStateChanged: (cb: (event: { state: string; previousState: string; reason: string; requestId: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('voice:state-changed', handler)
    return () => ipcRenderer.removeListener('voice:state-changed', handler)
  },

  onVoicePlayText: (cb: (cmd: { requestId: string; text: string; voiceId?: string; speed?: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('voice:play-text', handler)
    return () => ipcRenderer.removeListener('voice:play-text', handler)
  },

  onVoicePlayAudio: (cb: (payload: { requestId: string; mimeType: string; audioBytes: Uint8Array; durationMs?: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('voice:play-audio', handler)
    return () => ipcRenderer.removeListener('voice:play-audio', handler)
  },

  onVoiceStopPlayback: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('voice:stop-playback', handler)
    return () => ipcRenderer.removeListener('voice:stop-playback', handler)
  },

  onVoiceConfigChanged: (cb: (config: { enabled: boolean; muted: boolean; providerId: string; voiceId: string; speed: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('voice:config-changed', handler)
    return () => ipcRenderer.removeListener('voice:config-changed', handler)
  },

  // Playback events (renderer → main)
  voicePlaybackStarted: (requestId: string) =>
    ipcRenderer.send('voice:playback-started', requestId),

  voicePlaybackEnded: (requestId: string, durationMs: number) =>
    ipcRenderer.send('voice:playback-ended', requestId, durationMs),

  voicePlaybackError: (requestId: string, error: string) =>
    ipcRenderer.send('voice:playback-error', requestId, error),

  // ── DevTools ──
  devGetKnowledgeGraph: () => ipcRenderer.invoke('dev:get-knowledge-graph'),
  devGetKnowledgeMetrics: () => ipcRenderer.invoke('dev:get-knowledge-metrics'),
  onContextAssemblyTrace: (cb: (trace: any) => void) => {
    const handler = (_: Electron.IpcRendererEvent, trace: any) => cb(trace)
    ipcRenderer.on('dev:context-assembly-trace', handler)
    return () => ipcRenderer.removeListener('dev:context-assembly-trace', handler)
  }
})
