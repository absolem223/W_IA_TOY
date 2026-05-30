const os = require('os')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

console.log('--- ArgOS Environment Diagnostics ---')

console.log('OS:', os.type(), os.release(), os.arch())
console.log('Node Version:', process.version)
console.log('Node ABI:', process.versions.modules)

try {
  const electronStr = execSync('npx electron -v', { encoding: 'utf-8' }).trim()
  console.log('Electron Version:', electronStr)
} catch (e) {
  console.log('Electron Version: Not installed locally or error.')
}

try {
  const ffmpegStr = execSync('ffmpeg -version', { encoding: 'utf-8' }).split('\n')[0].trim()
  console.log('FFmpeg:', ffmpegStr)
} catch (e) {
  console.log('FFmpeg: NOT FOUND in PATH! Audio pipeline will fail.')
}

try {
  const ytdlpStr = execSync('yt-dlp --version', { encoding: 'utf-8' }).trim()
  console.log('yt-dlp:', ytdlpStr)
} catch (e) {
  console.log('yt-dlp: NOT FOUND in PATH! Video pipeline will fail.')
}

const whisperCli = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
const whisperPath = path.join(__dirname, '..', 'vendor', 'whisper', 'bin', whisperCli)
if (fs.existsSync(whisperPath)) {
  console.log('Whisper CLI: OK (Found at vendor/whisper/bin)')
} else {
  console.log('Whisper CLI: MISSING! Run npm run setup:whisper')
}

try {
  require('better-sqlite3')
  console.log('better-sqlite3: Loaded successfully.')
} catch (e) {
  console.log('better-sqlite3: FAILED TO LOAD! ABI Mismatch?')
  console.error(e.message)
}

console.log('-----------------------------------')
console.log('If you experience ABI mismatch errors, run: npm run rebuild')
