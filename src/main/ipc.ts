import { ipcMain, BrowserWindow } from 'electron'
import { getProvider } from './ai'
import type { ChatMessage } from '../shared/types'

export function registerIpcHandlers(): void {
  ipcMain.on('chat:send', async (event, messages: ChatMessage[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const provider = getProvider()

    try {
      await provider.stream(
        messages,
        (token) => event.sender.send('chat:token', token),
        ()      => event.sender.send('chat:done'),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      event.sender.send('chat:error', message)
    }
  })

  // Resize the window when the chat panel opens/closes (layout concern only)
  ipcMain.on('widget:resize', (_event, height: number) => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) win.setSize(380, height, true)
  })

  // Toggle window focusability when the panel opens/closes (interaction concern only).
  // Kept separate from widget:resize because size and focus state are independent
  // responsibilities that may diverge as the UI evolves.
  ipcMain.on('widget:panel-state', (_event, isOpen: boolean) => {
    const [win] = BrowserWindow.getAllWindows()
    if (!win) return

    win.setFocusable(isOpen)

    // Re-affirm the always-on-top level after a focusable change.
    // On Windows, setFocusable can cause the window to temporarily lose
    // its always-on-top status in some OS/driver combinations.
    win.setAlwaysOnTop(true, 'floating')
  })
}
