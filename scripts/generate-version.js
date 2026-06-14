const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const packageJsonPath = path.join(root, 'package.json')
const outputPath = path.join(root, 'src', 'shared', 'versionInfo.ts')

// Read version from package.json
let version = '3.5.0'
try {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  version = pkg.version || version
} catch (e) {
  console.error('Failed to read package.json version:', e)
}

// Get git commit hash only from the root directory E:\ArgOS 3.5\hub
let commitHash = 'N/A'
try {
  commitHash = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
} catch (e) {
  // Fallback: preserve existing commit hash from versionInfo.ts if it exists
  try {
    if (fs.existsSync(outputPath)) {
      const existingContent = fs.readFileSync(outputPath, 'utf8')
      const match = existingContent.match(/COMMIT_HASH\s*=\s*['"]([^'"]+)['"]/)
      if (match && match[1]) {
        commitHash = match[1]
      }
    }
  } catch (readErr) {
    // ignore
  }

  if (commitHash === 'N/A') {
    commitHash = 'e723094' // fallback default representing current commit hash
  }
}

// Generate build date/time in YYYY.MM.DD.HHmmss format
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const buildDate = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

const content = `export const VERSION = '${version}'
export const BUILD_DATE = '${buildDate}'
export const COMMIT_HASH = '${commitHash}'
`

fs.writeFileSync(outputPath, content, 'utf8')
console.log(`Generated versionInfo.ts: version=${version}, buildDate=${buildDate}, commitHash=${commitHash}`)
