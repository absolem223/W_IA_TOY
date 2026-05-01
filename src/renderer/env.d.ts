import type { ChatMessage } from '../shared/types'

// Typed declaration of the context bridge exposed by preload/index.ts
interface ElectronAPI {
  sendMessages:  (messages: ChatMessage[]) => void
  resizeWindow:  (height: number) => void    // layout: window geometry
  setPanelState: (isOpen: boolean) => void   // interaction: focus/input state
  onToken:  (cb: (token: string) => void) => () => void
  onDone:   (cb: () => void)              => () => void
  onError:  (cb: (msg: string) => void)   => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
