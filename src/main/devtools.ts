import { BrowserWindow } from 'electron'
import { join } from 'path'

let devtoolsWindow: BrowserWindow | null = null

function getDevtoolsUrl(): string {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}?devtools=true`
  }

  return `file://${join(__dirname, '../renderer/index.html')}?devtools=true`
}

export function openDevtoolsWindow(logInfo: (...args: any[]) => void, logError: (...args: any[]) => void): BrowserWindow {
  if (devtoolsWindow && !devtoolsWindow.isDestroyed()) {
    if (devtoolsWindow.isMinimized()) devtoolsWindow.restore()
    devtoolsWindow.show()
    devtoolsWindow.focus()
    return devtoolsWindow
  }

  devtoolsWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 640,
    minHeight: 520,
    show: false,
    backgroundColor: '#f7f7f8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  devtoolsWindow.once('ready-to-show', () => {
    if (devtoolsWindow && !devtoolsWindow.isDestroyed()) {
      devtoolsWindow.show()
    }
  })

  devtoolsWindow.on('closed', () => {
    devtoolsWindow = null
  })

  const url = getDevtoolsUrl()
  logInfo('[DEVTOOLS] Opening DevTools window at', url)
  devtoolsWindow.loadURL(url).catch((err) => {
    logError('[DEVTOOLS] Failed to load DevTools window:', err)
  })

  return devtoolsWindow
}
