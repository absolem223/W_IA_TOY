import { app } from 'electron'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc'

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
