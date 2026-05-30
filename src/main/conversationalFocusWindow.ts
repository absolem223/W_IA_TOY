/**
 * Conversational Focus Window: Maintains active conversation thread.
 * Summarizes old turns and focuses on recent, relevant exchanges.
 */

import type { ChatMessage } from '../shared/types'

export interface FocusWindowState {
  activeTopic: string | null
  recentObjectives: string[]
  assistantIdentity: { name?: string; role?: string }
  focusedTurns: ChatMessage[] // Recent turns (last 5-7)
  summaryOfOldTurns: string // Compact summary of earlier context
  lastTopicChange: number // timestamp
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export class ConversationalFocusWindow {
  private maxFocusedTurns = 6 // keep last 6-7 turns, summarize rest
  private topicChangeThresholdWords = 20 // detect topic shift after N words

  /**
   * Build focus window from message history.
   */
  public buildFocusWindow(
    messages: ChatMessage[],
    userInput: string,
    assistantIdentity?: { name?: string; role?: string }
  ): FocusWindowState {
    // Extract last N turns for active focus
    const focusedTurns = messages.slice(-this.maxFocusedTurns)

    // Summarize earlier turns
    const olderTurns = messages.slice(0, Math.max(0, messages.length - this.maxFocusedTurns))
    const summaryOfOldTurns = this.summarizeOldTurns(olderTurns)

    // Detect active topic from recent turns + current input
    const activeTopic = this.detectActiveTopic([...focusedTurns, { role: 'user' as const, content: userInput }])

    // Extract recent objectives from assistant responses
    const recentObjectives = this.extractObjectives(focusedTurns.filter((m) => m.role === 'assistant'))

    return {
      activeTopic,
      recentObjectives,
      assistantIdentity: assistantIdentity ?? {},
      focusedTurns,
      summaryOfOldTurns,
      lastTopicChange: Date.now(),
    }
  }

  /**
   * Detect active topic from conversation flow.
   */
  private detectActiveTopic(recentMessages: ChatMessage[]): string | null {
    if (recentMessages.length === 0) return null

    // Get user messages (they set the topic)
    const userMessages = recentMessages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .reverse()

    if (userMessages.length === 0) return null

    // Extract first 3-5 words from most recent user message as topic
    const words = userMessages[0].toLowerCase().split(/\s+/).slice(0, 5)
    return words.join(' ').substring(0, 60)
  }

  /**
   * Create compact summary of earlier conversation turns.
   */
  private summarizeOldTurns(oldTurns: ChatMessage[]): string {
    if (oldTurns.length === 0) return ''

    // Count turns and extract key keywords
    const userTurns = oldTurns.filter((m) => m.role === 'user')
    const assistantTurns = oldTurns.filter((m) => m.role === 'assistant')

    // Extract important keywords (words >5 chars, not stopwords)
    const stopwords = new Set(['about', 'while', 'could', 'would', 'should', 'being', 'which', 'there', 'where'])
    const allContent = oldTurns.map((m) => m.content).join(' ').toLowerCase()
    const words = allContent.split(/\s+/)
    const keywords = words
      .filter((w) => w.length > 5 && !stopwords.has(w))
      .slice(0, 10)
      .filter((item, index, arr) => arr.indexOf(item) === index) // unique

    const summary =
      userTurns.length > 0
        ? `Earlier discussion had ${userTurns.length} user turns and ${assistantTurns.length} assistant turns. Topics: ${keywords.join(', ')}.`
        : ''

    return summary
  }

  /**
   * Extract objectives/goals from assistant responses.
   */
  private extractObjectives(assistantMessages: ChatMessage[]): string[] {
    const objectives: string[] = []

    for (const msg of assistantMessages) {
      // Look for intent markers: "I'll", "Let's", "I can", "Here's", etc.
      const content = msg.content
      const intentRegex = /(?:I'll|Let's|I can|Here's|I'm going to|I'll help)\s+(.{0,60}?)[\.\?\!,]/g

      let match
      while ((match = intentRegex.exec(content)) !== null) {
        const objective = match[1].trim()
        if (objective.length > 5 && !objectives.includes(objective)) {
          objectives.push(objective)
        }
      }
    }

    return objectives.slice(0, 5) // keep last 5 objectives
  }

  /**
   * Render focus window as text block for prompt injection.
   */
  public renderFocusContext(state: FocusWindowState): string {
    const lines: string[] = []

    lines.push('<conversational_focus>')

    if (state.activeTopic) {
      lines.push(`activeTopic: ${state.activeTopic}`)
    }

    if (state.assistantIdentity.name) {
      lines.push(`assistantName: ${state.assistantIdentity.name}`)
    }

    if (state.recentObjectives.length > 0) {
      lines.push(`recentObjectives: ${state.recentObjectives.join('; ')}`)
    }

    if (state.summaryOfOldTurns) {
      lines.push(`priorContext: ${state.summaryOfOldTurns}`)
    }

    lines.push(`recentTurns: ${state.focusedTurns.length}`)
    lines.push('</conversational_focus>')

    return lines.join('\n')
  }

  /**
   * Estimate size of focus window context.
   */
  public estimateSize(state: FocusWindowState): number {
    return (
      (state.activeTopic?.length ?? 0) +
      state.recentObjectives.reduce((sum, obj) => sum + obj.length, 0) +
      state.summaryOfOldTurns.length +
      state.focusedTurns.reduce((sum, turn) => sum + turn.content.length, 0) +
      100
    )
  }

  /**
   * Truncate focus window if needed.
   */
  public truncate(state: FocusWindowState, maxChars: number): FocusWindowState {
    if (this.estimateSize(state) <= maxChars) {
      return state
    }

    // Reduce focused turns or summary
    const reduced = { ...state }
    if (reduced.summaryOfOldTurns.length > maxChars / 3) {
      reduced.summaryOfOldTurns = reduced.summaryOfOldTurns.substring(0, maxChars / 3)
    }

    if (this.estimateSize(reduced) > maxChars && reduced.focusedTurns.length > 2) {
      reduced.focusedTurns = reduced.focusedTurns.slice(-2)
    }

    return reduced
  }
}
