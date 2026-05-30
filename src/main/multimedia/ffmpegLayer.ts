import { execFile } from 'child_process'
import { join } from 'path'
import { promises as fs } from 'fs'

export async function runCommand(
  bin: string, 
  args: string[], 
  cwd: string, 
  abortSignal?: AbortSignal
): Promise<{ stdout: string, stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, args, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        if (abortSignal?.aborted) {
          return reject(new Error('Process cancelled by user'))
        }
        return reject(new Error(`Command failed: ${error.message}\nStderr: ${stderr}`))
      }
      resolve({ stdout, stderr })
    })

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        child.kill('SIGTERM')
      })
    }
  })
}

export async function convertAudioForWhisper(
  inputWav: string, 
  outputWav: string, 
  abortSignal: AbortSignal
): Promise<void> {
  // ffmpeg -i input.wav -ar 16000 -ac 1 -c:a pcm_s16le output.wav
  await runCommand('ffmpeg', [
    '-y',
    '-i', inputWav,
    '-ar', '16000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    outputWav
  ], process.cwd(), abortSignal)
}
