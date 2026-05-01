import { BrowserWindow } from 'electron'
import { join } from 'path'

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 60,          // starts collapsed (header only)
    minWidth: 380,
    minHeight: 60,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    // 'floating' is the correct overlay level — sits above normal windows
    // without interfering with system UI (dock, taskbar, menus)
    ...(process.platform !== 'linux' && { type: 'panel' }),
    resizable: false,
    skipTaskbar: true,   // widget is not a taskbar app; prevents OS focus/minimize side-effects
    focusable: false,    // overlay mode: drag never steals focus from background apps
    hasShadow: false,    // we use CSS shadow on the widget
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Set the overlay level explicitly — the constructor only accepts a boolean.
  // 'floating' sits above normal windows but below system UI (taskbar, menu bar).
  win.setAlwaysOnTop(true, 'floating')

  // Dev: load Vite dev server. Prod: load built file.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
