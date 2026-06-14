export interface VersionInfo {
  version: string
  buildDate: string
  commitHash: string
  mode: 'DEV' | 'PROD'
  executablePath: string
}
