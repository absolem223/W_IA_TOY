/**
 * Compares two semantic version strings to determine if the remote version is newer.
 * Strips 'v' prefix and prerelease suffixes (e.g. '-beta') before comparison.
 */
export function isNewerVersion(local: string, remote: string): boolean {
  const cleanLocal = local.replace(/^v/, '').split('-')[0]
  const cleanRemote = remote.replace(/^v/, '').split('-')[0]

  const localParts = cleanLocal.split('.').map(Number)
  const remoteParts = cleanRemote.split('.').map(Number)

  for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
    const l = localParts[i] || 0
    const r = remoteParts[i] || 0
    if (r > l) return true
    if (l > r) return false
  }
  return false
}
