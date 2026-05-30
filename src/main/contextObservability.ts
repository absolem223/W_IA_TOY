/**
 * Context Observability: Exposes metrics about context pressure and orchestration.
 */

import type { ContextPressureReport } from './contextOrchestration'
import type { OrchestrationResult } from './promptLayerOrchestrator'

export interface ContextObservabilityMetrics {
  timestamp: number
  globalPressure: number
  systemPromptSize: number
  systemPromptTokens: number
  messageHistorySize: number
  messageHistoryTokens: number
  memoryInjectionCount: number
  memoryCompressionRatio: number
  runtimeIntrospectionSize: number
  focusWindowSize: number
  layerUtilization: Record<string, number>
  pressureWarnings: string[]
  pressureRecommendations: string[]
  compressionApplied: Record<string, number>
  skippedLayers: string[]
}

export class ContextObservability {
  private history: ContextObservabilityMetrics[] = []
  private maxHistorySize = 50

  /**
   * Record orchestration result as observability metric.
   */
  public recordOrchestration(
    result: OrchestrationResult,
    pressure: ContextPressureReport,
    messageHistorySize: number
  ): ContextObservabilityMetrics {
    const metric: ContextObservabilityMetrics = {
      timestamp: Date.now(),
      globalPressure: pressure.globalPressure,
      systemPromptSize: result.finalSystemPrompt.length,
      systemPromptTokens: result.observability.systemPromptTokens,
      messageHistorySize,
      messageHistoryTokens: result.observability.messageHistoryTokens,
      memoryInjectionCount: result.injectedLayers.get('memory-context')?.charCount ?? 0,
      memoryCompressionRatio: result.compressionApplied.get('memory-context') ?? 1.0,
      runtimeIntrospectionSize: result.injectedLayers.get('runtime-introspection')?.charCount ?? 0,
      focusWindowSize: result.injectedLayers.get('focus-window')?.charCount ?? 0,
      layerUtilization: result.observability.layerUtilization,
      pressureWarnings: pressure.warnings,
      pressureRecommendations: pressure.recommendations,
      compressionApplied: Object.fromEntries(result.compressionApplied),
      skippedLayers: result.skippedLayers,
    }

    this.history.push(metric)
    if (this.history.length > this.maxHistorySize) {
      this.history.shift()
    }

    return metric
  }

  /**
   * Get recent metrics for UI visualization.
   */
  public getRecentMetrics(count = 10): ContextObservabilityMetrics[] {
    return this.history.slice(-count)
  }

  /**
   * Analyze pressure trends over time.
   */
  public analyzePressureTrend(): { average: number; max: number; min: number; trend: 'rising' | 'stable' | 'declining' } {
    if (this.history.length < 2) {
      return { average: 0, max: 0, min: 0, trend: 'stable' }
    }

    const pressures = this.history.map((m) => m.globalPressure)
    const average = pressures.reduce((sum, p) => sum + p, 0) / pressures.length
    const max = Math.max(...pressures)
    const min = Math.min(...pressures)

    // Determine trend: compare last 3 with average
    const recent = pressures.slice(-3)
    const recentAvg = recent.reduce((sum, p) => sum + p, 0) / recent.length
    const older = pressures.slice(0, -3)
    const olderAvg = older.length > 0 ? older.reduce((sum, p) => sum + p, 0) / older.length : 0

    let trend: 'rising' | 'stable' | 'declining' = 'stable'
    if (recentAvg > olderAvg + 5) trend = 'rising'
    if (recentAvg < olderAvg - 5) trend = 'declining'

    return { average, max, min, trend }
  }

  /**
   * Get summary of context health.
   */
  public getHealthSummary(): {
    healthy: boolean
    issues: string[]
    recommendations: string[]
  } {
    const latest = this.history[this.history.length - 1]
    if (!latest) return { healthy: true, issues: [], recommendations: [] }

    const issues: string[] = []
    const recommendations: string[] = []

    // Check pressure
    if (latest.globalPressure > 85) {
      issues.push(`🔴 Context pressure critical: ${latest.globalPressure}%`)
      recommendations.push('Reduce message history or compress memory')
    } else if (latest.globalPressure > 70) {
      issues.push(`🟡 Context pressure high: ${latest.globalPressure}%`)
      recommendations.push('Consider summarizing old turns')
    }

    // Check skipped layers
    if (latest.skippedLayers.length > 0) {
      issues.push(`⚠️ Skipped layers: ${latest.skippedLayers.join(', ')}`)
    }

    // Check layer utilization
    for (const [layer, util] of Object.entries(latest.layerUtilization)) {
      if (util > 120) {
        issues.push(`🔴 ${layer} exceeds budget: ${util}%`)
        recommendations.push(`Compress ${layer} content`)
      }
    }

    // Check memory injection effectiveness
    if (latest.memoryInjectionCount === 0 && latest.globalPressure < 50) {
      recommendations.push('Consider enabling memory injection for better context')
    }

    const healthy = issues.length === 0

    return { healthy, issues, recommendations }
  }

  /**
   * Reset history (e.g., on new session).
   */
  public reset(): void {
    this.history = []
  }
}
