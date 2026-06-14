import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// Get package.json version
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
const version = pkg.version || '0.0.0'

// Get git short hash
let commitHash = ''
try {
  commitHash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
} catch (e) {
  // no-op
}

// Generate build date/sequence
const now = new Date()
const yyyy = now.getFullYear()
const mm = String(now.getMonth() + 1).padStart(2, '0')
const dd = String(now.getDate()).padStart(2, '0')
const buildDate = `${yyyy}.${mm}.${dd}.${process.env.BUILD_NUMBER || '001'}`

// Write src/shared/versionInfo.ts
const versionInfoContent = `// Auto-generated file - do not edit manually
export const VERSION = '${version}'
export const BUILD_DATE = '${buildDate}'
export const COMMIT_HASH = '${commitHash}'
`

fs.writeFileSync(path.join(__dirname, 'src/shared/versionInfo.ts'), versionInfoContent, 'utf8')

const nodeEnv = process.env.NODE_ENV || 'production'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      // Inline NODE_ENV so the main process bundle knows its runtime mode.
      // electron-vite dev mode sets this to 'development' automatically;
      // pnpm start (production) passes NODE_ENV=production via cross-env.
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    },
  },
})

