import type { ToolRegistry } from './ToolRegistry'
import { globalJobQueue } from '../jobs/JobQueue'
import type { RetrievalResult } from '../retrieval/types'

export function registerMultimediaTools(registry: ToolRegistry) {
  registry.register(
  {
    name: 'youtube_ingest',
    description: "Start a background job to download, extract, and transcribe a YouTube video. Returns a Job ID. Do not wait for it, just tell the user the transcription has started.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full YouTube URL" },
        video_id: { type: "string", description: "The extracted YouTube Video ID" }
      },
      required: ["url", "video_id"],
      additionalProperties: false
    },
    capabilities: ['multimedia:process'],
    requiresApproval: true, // Downloading external binaries and running local CPU intensive tasks requires approval
    isTrusted: true
  },
  async (args, ctx: any) => {
    try {
      const jobId = globalJobQueue.enqueue('youtube', { url: args.url, videoId: args.video_id })
      return { 
        success: true, 
        message: `Video ingestion started. Job ID: ${jobId}. You can check the status later.` 
      }
    } catch (e: any) {
      return { success: false, error: `Failed to enqueue job: ${e.message}` }
    }
  }
  )

  registry.register(
  {
    name: 'check_job_status',
    description: "Check the status and results of a previously enqueued background job (e.g. YouTube ingestion).",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The Job ID to check" }
      },
      required: ["job_id"],
      additionalProperties: false
    },
    capabilities: ['multimedia:process'],
    requiresApproval: false,
    isTrusted: true
  },
  async (args, ctx: any) => {
    const job = globalJobQueue.getJob(args.job_id)
    if (!job) {
      return { success: false, error: `Job ${args.job_id} not found.` }
    }

    if (job.state === 'completed') {
      // Return the generated RetrievalResults
      return { success: true, state: job.state, data: job.result }
    }

    return { 
      success: true, 
      state: job.state, 
      progress: job.progress, 
      error: job.error 
    }
  }
)
}
