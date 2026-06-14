import type { ChatMessage } from '../shared/types'
import type { RuntimeStatusReport } from '../shared/runtime'
import type { VersionInfo } from '../shared/versionTypes'


// Typed declaration of the context bridge exposed by preload/index.ts
interface ElectronAPI {
  sendMessages:  (messages: ChatMessage[], requestId: number) => void
  resizeWindow:  (height: number) => void    // layout: window geometry
  setPanelState: (isOpen: boolean) => void   // interaction: focus/input state
  cancelChat:    (requestId: number) => void // stream cancellation
  quitApp:       () => void                  // application lifecycle
  transcribeAudio: (audioBuffer: ArrayBuffer, mimeType: string) => Promise<string>
  onStart:  (cb: (requestId: number) => void)                => () => void
  onToken:  (cb: (requestId: number, token: string) => void) => () => void
  onAbort:  (cb: (requestId: number) => void)                => () => void
  onDone:   (cb: (requestId: number) => void)                => () => void
  onError:  (cb: (requestId: number, msg: string) => void)   => () => void
  onProxyStatus: (cb: (status: 'connecting' | 'connected' | 'unavailable') => void) => () => void

  getRuntimeStatus: () => Promise<RuntimeStatusReport>
  onRuntimeStatus: (cb: (status: RuntimeStatusReport) => void) => () => void
  onContextObservability: (cb: (metrics: any) => void) => () => void
  onPromptPreview: (cb: (preview: string) => void) => () => void
  openDevtools: () => void

  // Memory system
  memorySave:          (title: string, content: string, tags: string[]) => Promise<{ id: string; filename: string }>
  memoryDelete:        (id: string) => Promise<boolean>
  memoryGetVault:      () => Promise<Array<{ id: string; filename: string; title: string; tags: string[]; trigger: string; createdAt: string }>>
  memoryGetProfile:    () => Promise<{ version: number; profile: Record<string, unknown>; patterns: unknown[]; stack: unknown }>
  memoryUpdateProfile: (key: string, value: string | string[]) => Promise<void>
  memoryMigrate:       (messages: ChatMessage[]) => Promise<{ success: boolean; turnsMigrated: number }>
  memoryGetStatus:     () => Promise<{ initialized: boolean; migrated: boolean; turnCount: number; vaultCount: number; profileKeys: number }>
  onMemorySaved:       (cb: (data: { id: string; title: string }) => void) => () => void
  onMigrationOffer:    (cb: (data: { messageCount: number }) => void) => () => void
  onMemoryUsed:        (cb: (requestId: number, memories: Array<{ type: string; label: string; score: number }>) => void) => () => void
  onCognitiveState:    (cb: (state: { activeTopic: string | null; contextPressure: number }) => void) => () => void
  actionExecute:       (rawCommand: string) => Promise<{ success: boolean; message: string; data?: Record<string, unknown> }>

  // Voice layer
  voiceRendererReady:  () => void
  voiceSpeak:          (text: string) => Promise<{ success: boolean; error?: string }>
  voiceStop:           () => Promise<void>
  voiceGetStatus:      () => Promise<{ state: string; enabled: boolean; muted: boolean; currentProvider: string; currentVoiceId: string; currentText?: string; currentRequestId?: string }>
  voiceGetVoices:      () => Promise<Array<{ id: string; name: string; language: string }>>
  voiceSetConfig:      (config: { enabled?: boolean; muted?: boolean; voiceId?: string; speed?: number; providerId?: string }) => Promise<unknown>
  onVoiceStateChanged: (cb: (event: { state: string; previousState: string; reason: string; requestId: string }) => void) => () => void
  onVoicePlayText:     (cb: (cmd: { requestId: string; text: string; voiceId?: string; speed?: number }) => void) => () => void
  onVoicePlayAudio:    (cb: (payload: { requestId: string; mimeType: string; audioBytes: Uint8Array; durationMs?: number }) => void) => () => void
  onVoiceStopPlayback: (cb: () => void) => () => void
  onVoiceConfigChanged: (cb: (config: { enabled: boolean; muted: boolean; providerId: string; voiceId: string; speed: number }) => void) => () => void
  voicePlaybackStarted: (requestId: string) => void
  voicePlaybackEnded:   (requestId: string, durationMs: number) => void
  voicePlaybackError:   (requestId: string, error: string) => void
  voiceAnalyzeAndSend:  (text: string) => Promise<{ success: boolean; error?: string }>

  // Agent loop and tool execution approvals
  onAgentLoop: (cb: (data: any) => void) => () => void
  onAgentStatus: (cb: (status: string) => void) => () => void
  onToolApprovalRequested: (cb: (data: { toolName: string, capabilities: string[] }) => void) => () => void
  sendToolApprovalResponse: (toolName: string, approved: boolean) => void
  onMemorySync: (cb: () => void) => () => void

  // DevTools Knowledge Graph and Assembly trace
  devGetKnowledgeGraph: () => Promise<any>
  devGetKnowledgeMetrics: () => Promise<any>
  onContextAssemblyTrace: (cb: (trace: any) => void) => () => void

  identityGet: () => Promise<string>
  identitySet: (content: string) => Promise<{ success: boolean }>
  identityReset: () => Promise<{ success: boolean; defaultVal: string }>
  onLLMStatus: (cb: (status: any) => void) => () => void
  onModelInfo: (cb: (requestId: number, info: any) => void) => () => void
  getVersionInfo: () => Promise<VersionInfo>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
