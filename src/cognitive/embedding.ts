const VECTOR_SIZE = 64

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'que', 'es', 'y', 'a', 'por', 'con', 'no', 'se', 'para',
  'the', 'a', 'an', 'in', 'on', 'of', 'to', 'and', 'is', 'it', 'for', 'with', 'not', 'as', 'at', 'by', 'or',
  'como', 'pero', 'muy', 'sin', 'sobre', 'esta', 'este', 'esto', 'quiero', 'necesito',
])

function hashToken(token: string): number {
  let hash = 2166136261
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !STOPWORDS.has(token))
}

export function embedText(text: string): number[] {
  const vector = new Array<number>(VECTOR_SIZE).fill(0)
  const tokens = tokenize(text)
  for (const token of tokens) {
    const index = hashToken(token) % VECTOR_SIZE
    vector[index] += 1
  }
  return normalize(vector)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length)
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (magnitude === 0) return vector
  return vector.map(value => value / magnitude)
}

export function keywordOverlap(a: string, b: string): number {
  const left = new Set(tokenize(a))
  const right = new Set(tokenize(b))
  if (left.size === 0 || right.size === 0) return 0
  let matches = 0
  for (const token of left) {
    if (right.has(token)) matches++
  }
  return matches / Math.max(left.size, right.size)
}
