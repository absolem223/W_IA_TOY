import { app } from 'electron'
import { execFile } from 'child_process'
import { cpus } from 'os'
import { join } from 'path'
import { promises as fs } from 'fs'

type Logger = (...args: any[]) => void

function getWhisperRoot(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'whisper')
  return join(__dirname, '../../vendor/whisper')
}

function getWhisperCliPath(): string {
  const executable = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  return join(getWhisperRoot(), 'bin', executable)
}

function getModelPath(): string {
  const modelFile = process.env.WHISPER_MODEL_FILE || 'ggml-base.bin'
  if (/[/\\]|\.\./.test(modelFile)) {
    throw new Error(`WHISPER_MODEL_FILE inválido (path traversal bloqueado): ${modelFile}`)
  }
  return join(getWhisperRoot(), 'models', modelFile)
}

function getThreadCount(): string {
  if (process.env.WHISPER_THREADS) return process.env.WHISPER_THREADS
  return String(Math.max(1, Math.min(4, cpus().length - 1)))
}

async function assertReadable(path: string, label: string): Promise<void> {
  try {
    await fs.access(path)
  } catch {
    throw new Error(`${label} no encontrado: ${path}. Ejecutá npm run setup:whisper y reconstruí el .exe.`)
  }
}

function runFile(
  file: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message).trim()))
          return
        }
        resolve({ stdout, stderr })
      },
    )
  })
}

export async function transcribeAudioOffline(
  audioBuffer: ArrayBuffer,
  mimeType: string,
  logInfo: Logger = console.log,
  logError: Logger = console.error,
): Promise<string> {
  const start = Date.now()
  const whisperCli = getWhisperCliPath()
  const model = getModelPath()

  if (!mimeType.includes('wav')) {
    throw new Error(`Formato de audio no soportado para transcripción offline: ${mimeType || 'desconocido'}`)
  }

  await assertReadable(whisperCli, 'whisper-cli')
  await assertReadable(model, 'Modelo Whisper')

  const tempDir = await fs.mkdtemp(join(app.getPath('temp'), 'widget-ia-voice-'))
  const wavPath = join(tempDir, 'input.wav')
  const outputBase = join(tempDir, 'transcript')
  const outputTxt = `${outputBase}.txt`

  try {
    await fs.writeFile(wavPath, Buffer.from(audioBuffer))

    const args = [
      '-m', model,
      '-f', wavPath,
      '-l', process.env.WHISPER_LANGUAGE || 'es',
      '-t', getThreadCount(),
      '-nt',
      '-otxt',
      '-of', outputBase,
    ]

    logInfo(`[VOICE] Offline transcription started (${Buffer.byteLength(Buffer.from(audioBuffer))} bytes)`)
    logInfo(`[VOICE] whisper-cli: ${whisperCli}`)
    logInfo(`[VOICE] model: ${model}`)

    await runFile(whisperCli, args, 120000)

    const transcript = (await fs.readFile(outputTxt, 'utf8')).trim()
    if (!transcript) throw new Error('No se detectó voz en la grabación.')

    logInfo(`[VOICE] Offline transcription done in ${Date.now() - start}ms`)
    return transcript
  } catch (err) {
    logError('[VOICE] Offline transcription failed:', err)
    throw err
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
