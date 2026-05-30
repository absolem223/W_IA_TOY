/**
 * Generic Phrase Reduction: Post-processes model output to reduce repetitive LLM patterns.
 * Filters out common defaults without breaking conversation.
 */

interface PhraseMatcher {
  patterns: RegExp[]
  replacement?: string // if undefined, just remove
  priority: number // higher = applied first
}

export class GenericPhraseReducer {
  private matchers: PhraseMatcher[]

  constructor() {
    this.matchers = [
      // Highest priority: remove full disclaimers
      {
        patterns: [
          /soy\s+(?:un|una)\s+(?:modelo|IA|inteligencia\s+artificial|asistente\s+de\s+IA)[^.]*[.!]/gi,
          /como\s+(?:un|una)\s+(?:modelo|IA)[^.]*[.!]/gi,
          /no\s+tengo\s+(?:memoria|la\s+capacidad)[^.]*[.!]/gi,
          /debes\s+saber\s+que\s+soy[^.]*[.!]/gi,
        ],
        priority: 100,
      },

      // High priority: reduce generic greetings
      {
        patterns: [/¿en\s+qué\s+te\s+ayudo\s+hoy\?/gi, /¿en\s+qué\s+te\s+puedo\s+ayudar\?/gi, /¡hola!\s+/gi, /hola,\s+/gi],
        priority: 90,
      },

      // Medium priority: reduce "I'll explain" / "I can"
      {
        patterns: [
          /te\s+explico\s+|te\s+cuento\s+|déjame\s+que\s+te\s+/gi,
          /puedo\s+ayudarte\s+(?:con|a)\s+/gi,
          /puedo\s+decirte\s+que\s+/gi,
        ],
        priority: 70,
      },

      // Medium priority: reduce generic transitions
      {
        patterns: [
          /bien,\s+|ok,\s+|bueno,\s+|entonces,\s+/gi,
          /basándome\s+en\s+lo\s+que\s+dijiste\s+/gi,
          /según\s+tu\s+perfil\s+/gi,
        ],
        priority: 60,
      },

      // Lower priority: reduce meta-commentary
      {
        patterns: [
          /espero\s+(?:que|qué)\s+te\s+(?:sea|haya\s+sido)\s+útil/gi,
          /¿necesitás\s+algo\s+más\?/gi,
          /cualquier\s+otra\s+cosa/gi,
        ],
        priority: 40,
      },
    ]

    this.matchers.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Reduce generic phrases from response.
   */
  public reduce(response: string): string {
    let result = response

    for (const matcher of this.matchers) {
      for (const pattern of matcher.patterns) {
        result = result.replace(pattern, matcher.replacement ?? '')
      }
    }

    // Clean up excess whitespace
    result = result.replace(/\s+\n/g, '\n').replace(/\n\s+/g, '\n').replace(/\s{2,}/g, ' ')

    return result.trim()
  }

  /**
   * Check if response contains too much generic content.
   */
  public hasHighGenericRatio(response: string): boolean {
    let genericCount = 0

    for (const matcher of this.matchers) {
      for (const pattern of matcher.patterns) {
        const matches = response.match(pattern)
        genericCount += matches ? matches.length : 0
      }
    }

    // If more than 3 generic phrases in short response, flag it
    if (response.length < 200 && genericCount > 2) return true
    if (response.length < 500 && genericCount > 4) return true

    return false
  }

  /**
   * Suggest a more authentic alternative for generic openers.
   */
  public suggestAuthenticAlternative(response: string): string | null {
    // If it starts with generic greeting, suggest something warmer
    if (/^¡?hola[!,]?\s+/gi.test(response)) {
      return response.replace(/^¡?hola[!,]?\s+/gi, '')
    }

    if (/^¿en\s+qué\s+te\s+(?:ayudo|puedo\s+ayudar)/gi.test(response)) {
      // Remove the question, keep what follows
      return response.replace(/^¿en\s+qué\s+te\s+(?:ayudo|puedo\s+ayudar)\?[\s\n]*/gi, '')
    }

    if (/^bueno,\s+/gi.test(response)) {
      return response.replace(/^bueno,\s+/gi, '')
    }

    return null
  }

  /**
   * Post-process: reduce generic phrases and suggest alternatives.
   */
  public postProcess(response: string): string {
    let result = this.reduce(response)

    // If significantly shortened by reduction, might be too thin—don't over-process
    if (result.length < response.length * 0.3) {
      result = response // keep original if too much removed
    }

    return result
  }
}
