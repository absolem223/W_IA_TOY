import type { CognitiveSnapshot } from './types'

export interface SnapshotBundle {
  version: 1
  createdAt: string
  snapshots: CognitiveSnapshot[]
  checksum: string
}

export class SnapshotPersistenceLayer {
  export(snapshots: CognitiveSnapshot[], createdAt = new Date()): string {
    const bundle: SnapshotBundle = {
      version: 1,
      createdAt: createdAt.toISOString(),
      snapshots,
      checksum: checksum(JSON.stringify(snapshots)),
    }
    return JSON.stringify(bundle, null, 2)
  }

  import(serialized: string): SnapshotBundle {
    const parsed = JSON.parse(serialized) as SnapshotBundle
    const actual = checksum(JSON.stringify(parsed.snapshots))
    if (actual !== parsed.checksum) throw new Error('Snapshot checksum mismatch')
    return parsed
  }

  compare(a: CognitiveSnapshot, b: CognitiveSnapshot): { compatible: boolean; reason: string } {
    if (!a.frameId || !b.frameId) return { compatible: false, reason: 'missing frame id' }
    if (new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime()) {
      return { compatible: false, reason: 'snapshots are out of temporal order' }
    }
    return { compatible: true, reason: 'ok' }
  }

  verifyReplayIntegrity(snapshots: CognitiveSnapshot[]): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    for (let i = 1; i < snapshots.length; i++) {
      if (new Date(snapshots[i - 1].timestamp).getTime() > new Date(snapshots[i].timestamp).getTime()) {
        errors.push(`timestamp order violation at ${snapshots[i].frameId}`)
      }
    }
    return { valid: errors.length === 0, errors }
  }
}

function checksum(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash).toString(16)
}
