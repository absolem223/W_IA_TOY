export type GoogleScope = 
  | 'profile.basic'
  | 'gmail.readonly'
  | 'calendar.readonly'
  | 'drive.readonly'
  | 'youtube.readonly'

export const GOOGLE_SCOPES_MAP: Record<GoogleScope, string> = {
  'profile.basic': 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
  'gmail.readonly': 'https://www.googleapis.com/auth/gmail.readonly',
  'calendar.readonly': 'https://www.googleapis.com/auth/calendar.readonly',
  'drive.readonly': 'https://www.googleapis.com/auth/drive.readonly',
  'youtube.readonly': 'https://www.googleapis.com/auth/youtube.readonly'
}

export interface OAuthAccountMetadata {
  email: string
  name: string
  picture?: string
}

export interface OAuthSession {
  accountId: string // Usually the email
  accessToken: string
  refreshToken?: string
  expiresAt: number
  grantedScopes: GoogleScope[]
  metadata: OAuthAccountMetadata
}
