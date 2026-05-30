export type JobState = 'queued' | 'running' | 'completed' | 'error' | 'cancelled'
export type JobType = 'ffmpeg' | 'whisper' | 'youtube' | 'embeddings'

export interface Job<T = any, R = any> {
  id: string
  type: JobType
  payload: T
  state: JobState
  progress: number // 0 to 100
  error?: string
  result?: R
  createdAt: number
  startedAt?: number
  completedAt?: number
}

export type JobExecutor<T = any, R = any> = (job: Job<T, R>, updateProgress: (p: number) => void, abortSignal: AbortSignal) => Promise<R>

export class JobQueue {
  private jobs: Map<string, Job> = new Map()
  private controllers: Map<string, AbortController> = new Map()
  private executors: Map<JobType, JobExecutor> = new Map()

  registerExecutor(type: JobType, executor: JobExecutor) {
    this.executors.set(type, executor)
  }

  enqueue<T>(type: JobType, payload: T): string {
    const id = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const job: Job<T> = {
      id,
      type,
      payload,
      state: 'queued',
      progress: 0,
      createdAt: Date.now()
    }
    this.jobs.set(id, job)
    this.processQueue().catch(console.error)
    return id
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values())
  }

  cancel(id: string) {
    const job = this.jobs.get(id)
    if (job && (job.state === 'queued' || job.state === 'running')) {
      job.state = 'cancelled'
      const controller = this.controllers.get(id)
      if (controller) {
        controller.abort()
      }
    }
  }

  private async processQueue() {
    // Basic concurrency: run one at a time for now
    const runningCount = Array.from(this.jobs.values()).filter(j => j.state === 'running').length
    if (runningCount > 0) return

    const nextJob = Array.from(this.jobs.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .find(j => j.state === 'queued')

    if (!nextJob) return

    const executor = this.executors.get(nextJob.type)
    if (!executor) {
      nextJob.state = 'error'
      nextJob.error = `No executor registered for job type: ${nextJob.type}`
      return
    }

    nextJob.state = 'running'
    nextJob.startedAt = Date.now()
    const controller = new AbortController()
    this.controllers.set(nextJob.id, controller)

    try {
      const updateProgress = (p: number) => {
        nextJob.progress = p
      }
      const result = await executor(nextJob, updateProgress, controller.signal)
      if (controller.signal.aborted) {
        nextJob.state = 'cancelled'
      } else {
        nextJob.state = 'completed'
        nextJob.result = result
        nextJob.progress = 100
      }
    } catch (e: any) {
      nextJob.state = 'error'
      nextJob.error = e.message
    } finally {
      nextJob.completedAt = Date.now()
      this.controllers.delete(nextJob.id)
      
      // Process next job
      this.processQueue().catch(console.error)
    }
  }
}

export const globalJobQueue = new JobQueue()
