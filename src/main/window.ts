import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import type { VoiceManager } from './voice/VoiceManager'

export function createWindow(
  logInfo: (...args: any[]) => void,
  logError: (...args: any[]) => void,
  voiceManager?: VoiceManager | null,
): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 60,          // starts collapsed (header only)
    minWidth: 320,
    maxWidth: 900,
    minHeight: 60,
    maxHeight: 900,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    icon: join(app.getAppPath(), 'resources/icon.ico'),
    // 'floating' is the correct overlay level — sits above normal windows
    // without interfering with system UI (dock, taskbar, menus)
    ...(process.platform !== 'linux' && { type: 'panel' }),
    resizable: true,
    skipTaskbar: false,
    focusable: false,    // overlay mode: drag never steals focus from background apps
    hasShadow: false,    // we use CSS shadow on the widget
      webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      devTools: process.env.NODE_ENV === 'development',
    },
  })

  // Close devtools if opened in production as fallback
  if (process.env.NODE_ENV !== 'development') {
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools()
    })
  }

  // Set the overlay level explicitly — the constructor only accepts a boolean.
  // 'floating' sits above normal windows but below system UI (taskbar, menu bar).
  win.setAlwaysOnTop(true, 'floating')

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logError(`Window failed to load: ${errorDescription} (${errorCode}) at ${validatedURL}`);
  });

  win.webContents.on('did-finish-load', () => {
    logInfo('Window finished loading successfully.');
  });

  let crashCount = 0
  const MAX_CRASH_RELOADS = 3

  win.webContents.on('crashed', (_event, killed) => {
    crashCount++
    logError(`Window crashed (#${crashCount}). Killed: ${killed}`)
    // Clean up voice state — renderer is gone
    voiceManager?.handleRendererCrash()
    if (crashCount <= MAX_CRASH_RELOADS) {
      const delay = Math.min(1000 * Math.pow(2, crashCount - 1), 8000)
      logInfo(`Attempting renderer reload in ${delay}ms (attempt ${crashCount}/${MAX_CRASH_RELOADS})`)
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.webContents.reload()
        }
      }, delay)
    } else {
      logError(`Max crash reloads (${MAX_CRASH_RELOADS}) reached. Not reloading.`)
    }
  })

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) { // 2 = warning, 3 = error
      logError(`[RENDERER ERROR] ${message} (at ${sourceId}:${line})`);
    } else {
      logInfo(`[RENDERER] ${message}`);
    }
  });

  // Dev: load Vite dev server. Prod: load built file.
  try {
    if (process.env['ELECTRON_RENDERER_URL']) {
      logInfo('Loading renderer from URL:', process.env['ELECTRON_RENDERER_URL']);
      win.loadURL(process.env['ELECTRON_RENDERER_URL']).catch(err => {
        logError('Failed to loadURL:', err);
      });
    } else {
      const htmlPath = join(__dirname, '../renderer/index.html');
      logInfo('Loading renderer from file:', htmlPath);
      win.loadFile(htmlPath).catch(err => {
        logError('Failed to loadFile:', err);
      });
    }
  } catch (err) {
    logError('Synchronous error loading content into window:', err);
  }

  return win
}
