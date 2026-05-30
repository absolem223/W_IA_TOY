// ── Memory System — Identity Continuity Layer ──────────────────
// Minimalist, regex-based heuristic extractor.
// Extracts explicit identity markers (name, project) directly from user messages
// without needing an external LLM or vector provider.

import type { AssistantProfile } from './types'

export interface ExtractedIdentity {
  user_name?: string
  current_project?: string
  preferences?: string[]
  tech_stack?: string[]
  interaction_style?: string
  frequent_topics?: string[]
}

export const DEFAULT_ASSISTANT_PROFILE: AssistantProfile = {
  assistant_name: "Argos",
  assistant_role: "companion",
  speaking_style: "warm",
  emotional_tone: "calm",
  preferred_relationship: "friend",
}

export interface ExtractedAssistantMutation {
  assistant_name?: string
}

/**
 * Extracts personal identity markers from a Spanish user text.
 */
export function extractIdentity(text: string): ExtractedIdentity {
  const result: ExtractedIdentity = {}
  
  // Clean punctuation and make lowercase for matching
  const cleaned = text.trim()
  const lower = cleaned.toLowerCase()

  // 1. User Name Extraction
  // Matches "mi nombre es Nahuel", "me llamo Nahuel", "soy Nahuel"
  const nameMatch = cleaned.match(/(?:mi nombre es|me llamo|soy)\s+([A-Z][a-záéíóúñA-Z]+(?:\s+[A-Z][a-záéíóúñA-Z]+)*)/i)
  if (nameMatch) {
    result.user_name = nameMatch[1].trim()
  } else {
    // Fallback if capitalized incorrectly but clear structure
    const nameMatchLower = lower.match(/(?:mi nombre es|me llamo|soy)\s+([a-záéíóúñ]+)/)
    if (nameMatchLower) {
      result.user_name = nameMatchLower[1].charAt(0).toUpperCase() + nameMatchLower[1].slice(1)
    }
  }

  // 2. Current Project Extraction
  // Matches "estoy trabajando en X", "mi proyecto actual es X", "el proyecto es X"
  const projectMatch = lower.match(/(?:estoy trabajando en|mi proyecto actual es|el proyecto es)\s+([^.]+)/)
  if (projectMatch) {
    result.current_project = projectMatch[1].trim()
  }

  // 3. Simple Preferences (only if not an assistant name mutation)
  const prefMatch = lower.match(/(?:prefiero|me gusta|me gustan)\s+(?!que te llames)([^.]+)/)
  if (prefMatch) {
    result.preferences = [prefMatch[1].trim()]
  }

  // 4. Tech Stack (Implicit)
  const techMatch = lower.match(/(?:siempre uso|estoy usando|programo en|desarrollo en|trabajo con)\s+([a-zA-Z0-9\s.]+)(?:framework|lenguaje|tecnología)?/i)
  if (techMatch && techMatch[1].length < 20) {
    result.tech_stack = [techMatch[1].trim()]
  }

  // 5. Interaction Style (Implicit)
  const styleMatch = lower.match(/(?:respondeme de forma|quiero respuestas|se|sé)\s+(corta|breve|detallada|concisa|directa|técnica|amigable)/i)
  if (styleMatch) {
    result.interaction_style = styleMatch[1].trim()
  }

  // 6. Frequent Topics (Contextual)
  const topicMatch = lower.match(/(?:hablemos de|tengo una duda sobre|mi problema es con|estoy aprendiendo)\s+([^.]+)/)
  if (topicMatch && topicMatch[1].length < 30) {
    result.frequent_topics = [topicMatch[1].trim()]
  }

  return result
}

/**
 * Extracts mutations directed at the assistant's own identity.
 */
export function extractAssistantMutation(text: string): ExtractedAssistantMutation {
  const result: ExtractedAssistantMutation = {}
  
  const cleaned = text.trim()
  
  // Name mutation
  // Matches "prefiero que te llames Rodolfo", "llamate Rodolfo", "tu nombre es Rodolfo", "te vas a llamar Rodolfo"
  const nameMatch = cleaned.match(/(?:prefiero que te llames|llamate|tu nombre (?:ahora )?es|te vas a llamar|pasas a llamarte|quiero que te llames)[\s.]+([A-Z][a-záéíóúñA-Z]+)/i)
  if (nameMatch) {
    let rawName = nameMatch[1].trim()
    result.assistant_name = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase()
  }

  return result
}
