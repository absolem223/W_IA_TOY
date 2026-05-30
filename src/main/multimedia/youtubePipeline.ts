import { join } from 'path'
import { promises as fs } from 'fs'
import type { Job, JobExecutor } from '../jobs/JobQueue'
import { globalMediaStorage } from './MediaStorage'
import { runCommand, convertAudioForWhisper } from './ffmpegLayer'
import { transcribeAudioOffline } from '../offlineTranscription'
import type { RetrievalResult } from '../retrieval/types'
import { globalKnowledgeStore } from '../knowledge/KnowledgeStore'
import type { KnowledgeNode } from '../knowledge/types'

export type MediaPipelineState = 'downloading' | 'extracting' | 'transcribing' | 'chunking' | 'completed' | 'failed' | 'cancelled'

export interface YoutubeJobPayload {
  url: string
  videoId: string
}

export interface YoutubeJobResult {
  videoId: string
  title: string
  duration: number
  chunks: RetrievalResult[]
}

export const youtubeExecutor: JobExecutor<YoutubeJobPayload, YoutubeJobResult> = async (job, updateProgress, abortSignal) => {
  const { url, videoId } = job.payload
  const workspace = await globalMediaStorage.createTempWorkspace(job.id)
  
  try {
    // 1. Downloading Metadata & Captions
    updateProgress(10)
    // Attempt to download subtitles first
    // yt-dlp --write-auto-subs --write-subs --sub-langs en,es --skip-download --dump-json URL
    const ytDlpArgs = [
      '--write-auto-subs', '--write-subs', '--sub-langs', 'en,es',
      '--skip-download', '--dump-json',
      '-o', join(workspace, '%(id)s.%(ext)s'),
      url
    ]

    const { stdout: jsonOut } = await runCommand('yt-dlp', ytDlpArgs, workspace, abortSignal)
    const metadata = JSON.parse(jsonOut)
    
    updateProgress(30)
    let transcriptText = ''
    
    // Check if subtitles were downloaded (.vtt)
    const files = await fs.readdir(workspace)
    const vttFile = files.find(f => f.endsWith('.vtt'))
    
    if (vttFile) {
      console.log(`[MEDIA_PIPELINE] Found official captions: ${vttFile}`)
      const vttContent = await fs.readFile(join(workspace, vttFile), 'utf-8')
      transcriptText = parseVTT(vttContent)
    } else {
      console.log(`[MEDIA_PIPELINE] No official captions found. Falling back to whisper.`)
      // 2. Download audio for Whisper
      updateProgress(40)
      await runCommand('yt-dlp', [
        '--extract-audio', '--audio-format', 'wav',
        '-o', join(workspace, 'audio.%(ext)s'),
        url
      ], workspace, abortSignal)
      
      const audioFiles = await fs.readdir(workspace)
      const wavFile = audioFiles.find(f => f.endsWith('.wav'))
      
      if (!wavFile) throw new Error('Audio download failed, no WAV found.')
      
      const rawWavPath = join(workspace, wavFile)
      const whisperWavPath = join(workspace, 'whisper_ready.wav')
      
      // 3. Ffmpeg conversion (mono 16khz)
      updateProgress(60)
      await convertAudioForWhisper(rawWavPath, whisperWavPath, abortSignal)
      
      // 4. Whisper transcription
      updateProgress(75)
      const audioBuffer = await fs.readFile(whisperWavPath)
      // Note: transcribeAudioOffline handles its own temp dirs, but we feed it the buffer.
      transcriptText = await transcribeAudioOffline(
        audioBuffer.buffer as ArrayBuffer, 
        'audio/wav',
        console.log,
        console.error
      )
    }
    
    if (abortSignal.aborted) throw new Error('Cancelled')

    // 5. Chunking
    updateProgress(90)
    const chunks = chunkTranscript(transcriptText, videoId, metadata.title, metadata.duration)

    // 6. Push to Knowledge Store
    for (const chunk of chunks) {
      const node: KnowledgeNode = {
        id: chunk.id,
        level: 'persistent',
        content: chunk.snippet,
        metadata: chunk.metadata || {},
        expiresAt: null, // Keep persistently until cleanup logic decides otherwise
        isPinned: false,
        trustScore: 0.9,
        usageScore: 0,
        decayScore: 0,
        retrievalFrequency: 0,
        lastRetrievedAt: 0,
        provenance: {
          sourceOrigin: 'youtube',
          pipelineVersion: '1.0.0',
          transcriptSource: vttFile ? 'vtt' : 'whisper.cpp',
          confidence: vttFile ? 1.0 : 0.85,
          processingTimestamp: Date.now(),
          chunkLineage: videoId
        }
      }
      globalKnowledgeStore.upsertNode(node)

      // Empezar relaciones estructurales: video <-> topics
      // As a foundation, we create an edge representing the video to this chunk
      globalKnowledgeStore.addEdge({
        sourceId: videoId,
        targetId: chunk.id,
        relationType: 'has_chunk',
        weight: 1.0
      })
    }

    updateProgress(100)
    return {
      videoId,
      title: metadata.title,
      duration: metadata.duration,
      chunks
    }

  } finally {
    // 6. Temp Cleanup
    await globalMediaStorage.cleanupWorkspace(job.id)
  }
}

// Basic VTT parser to extract raw text
function parseVTT(vtt: string): string {
  const lines = vtt.split('\n')
  const textLines: string[] = []
  let isHeader = true
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (isHeader && trimmed === '') {
      isHeader = false
      continue
    }
    if (isHeader) continue
    if (trimmed === '') continue
    if (trimmed.includes('-->')) continue // timestamp line
    if (/^[0-9]+$/.test(trimmed)) continue // cue id
    
    // clean up tags like <c> or <i>
    const cleanLine = trimmed.replace(/<[^>]+>/g, '')
    if (cleanLine && !textLines.includes(cleanLine)) {
      textLines.push(cleanLine)
    }
  }
  
  return textLines.join(' ')
}

// Semantic Chunking: Split transcript into paragraphs of ~1000 characters
function chunkTranscript(transcript: string, videoId: string, title: string, duration: number): RetrievalResult[] {
  const chunks: RetrievalResult[] = []
  const sentences = transcript.match(/[^.!?]+[.!?]+/g) || [transcript]
  
  let currentChunk = ''
  let chunkIndex = 0
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > 1000) {
      chunks.push({
        id: `${videoId}-chunk-${chunkIndex}`,
        title: `${title} (Part ${chunkIndex + 1})`,
        url: `https://youtube.com/watch?v=${videoId}`,
        snippet: currentChunk.trim(),
        source: 'multimedia',
        metadata: { videoId, duration, type: 'transcript_chunk', chunkIndex }
      })
      currentChunk = sentence
      chunkIndex++
    } else {
      currentChunk += ' ' + sentence
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `${videoId}-chunk-${chunkIndex}`,
      title: `${title} (Part ${chunkIndex + 1})`,
      url: `https://youtube.com/watch?v=${videoId}`,
      snippet: currentChunk.trim(),
      source: 'multimedia',
      metadata: { videoId, duration, type: 'transcript_chunk', chunkIndex }
    })
  }
  
  return chunks
}
