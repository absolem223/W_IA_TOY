import { contextBridge, ipcRenderer } from 'electron'
import type { ChatMessage } from '../shared/types'

// Exposes a minimal, typed surface to the renderer.
// Nothing from Node/Electron leaks beyond this file.
contextBridge.exposeInMainWorld('electronAPI', {
  sendMessages: (messages: ChatMessage[]) =>
    ipcRenderer.send('chat:send', messages),

  // Layout: controls window geometry
  resizeWindow: (height: number) =>
    ipcRenderer.send('widget:resize', height),

  // Interaction: controls focus/input state — intentionally separate from resize
  setPanelState: (isOpen: boolean) =>
    ipcRenderer.send('widget:panel-state', isOpen),

  onToken: (cb: (token: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, token: string) => cb(token)
    ipcRenderer.on('chat:token', handler)
    return () => ipcRenderer.removeListener('chat:token', handler)
  },

  onDone: (cb: () => void) => {
    ipcRenderer.on('chat:done', cb)
    return () => ipcRenderer.removeListener('chat:done', cb)
  },

  onError: (cb: (msg: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('chat:error', handler)
    return () => ipcRenderer.removeListener('chat:error', handler)
  },
})
