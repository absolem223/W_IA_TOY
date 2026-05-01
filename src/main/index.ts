import { app } from 'electron'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc'

app.whenReady().then(() => {
  const API_KEY = process.env.API_KEY

  if (!API_KEY) {
    throw new Error("Missing API_KEY in environment variables")
  }

  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
