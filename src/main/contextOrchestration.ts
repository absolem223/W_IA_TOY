/**
 * Context Orchestration: Manages token budget, layer priorities, and pressure.
 * Prevents prompt saturation by selectively degrading lower-priority context.
 */

export interface LayerBudget {
  id: string
  label: string
  softLimit: number // warn when exceeded
  hardLimit: number // truncate if exceeded
  priority: number // 0-100, higher = prioritized
  currentUsage: number // measured in chars
}

export interface ContextPressureReport {
  totalChars: number
  totalTokens: number
  globalPressure: number // 0-100
  layerPressure: Map<string, number>
  warnings: string[]
  recommendations: string[]
}

export interface PromptLayer {
  id: string
  label: string
  content: string
  charCount: number
  isCompressible: boolean
  compressionRatio?: number // 0-1, how much can be reduced
}

const DEFAULT_TOKEN_PER_4_CHARS = 1 // conservative estimate

export class ContextOrchestrator {
  private maxTokenBudget: number // total available tokens
  private layers: Map<string, LayerBudget> = new Map()

  constructor(maxTokenBudget = 6000) {
    // 6000 tokens ≈ 24KB context, conservative for 8K models
    this.maxTokenBudget = maxTokenBudget

    // Define default layers with budgets
    this.registerLayer({
      id: 'system-identity',
      label: 'System Identity & Companion Mode',
      softLimit: 1200,
      hardLimit: 1500,
      priority: 100,
      currentUsage: 0,
    })

    this.registerLayer({
      id: 'runtime-introspection',
      label: 'Runtime Introspection & Diagnostics',
      softLimit: 600,
      hardLimit: 900,
      priority: 85,
      currentUsage: 0,
    })

    this.registerLayer({
      id: 'assistant-identity',
      label: 'Assistant Identity & Memory',
      softLimit: 800,
      hardLimit: 1200,
      priority: 95,
      currentUsage: 0,
    })

    this.registerLayer({
      id: 'memory-context',
      label: 'User Memory & Profile',
      softLimit: 1000,
      hardLimit: 1500,
      priority: 80,
      currentUsage: 0,
    })

    this.registerLayer({
      id: 'focus-window',
      label: 'Active Conversation Focus',
      softLimit: 1500,
      hardLimit: 2000,
      priority: 95,
      currentUsage: 0,
    })

    this.registerLayer({
      id: 'message-history',
      label: 'Recent Message History',
      softLimit: 1000,
      hardLimit: 1500,
      priority: 70,
      currentUsage: 0,
    })

    this.registerLayer({
      id: 'constraints',
      label: 'Operational Constraints & Policy',
      softLimit: 300,
      hardLimit: 500,
      priority: 100,
      currentUsage: 0,
    })
  }

  public registerLayer(layer: LayerBudget): void {
    this.layers.set(layer.id, { ...layer })
  }

  public updateLayerUsage(layerId: string, charCount: number): void {
    const layer = this.layers.get(layerId)
    if (layer) {
      layer.currentUsage = charCount
    }
  }

  public measurePressure(layers: PromptLayer[]): ContextPressureReport {
    let totalChars = 0
    const layerPressure = new Map<string, number>()
    const warnings: string[] = []
    const recommendations: string[] = []

    for (const layer of layers) {
      totalChars += layer.charCount
      const budget = this.layers.get(layer.id)
      if (budget) {
        const ratio = layer.charCount / budget.softLimit
        const pressure = Math.min(100, Math.round(ratio * 100))
        layerPressure.set(layer.id, pressure)

        this.updateLayerUsage(layer.id, layer.charCount)

        if (pressure > 100) {
          warnings.push(`⚠️ ${budget.label}: ${pressure}% of soft limit (${layer.charCount}/${budget.softLimit})`)
          if (layer.charCount > budget.hardLimit) {
            warnings.push(`🛑 ${budget.label}: HARD LIMIT EXCEEDED (${layer.charCount}/${budget.hardLimit})`)
          }
        }
      }
    }

    const totalTokens = Math.ceil(totalChars * DEFAULT_TOKEN_PER_4_CHARS)
    const globalPressure = Math.min(100, Math.round((totalTokens / this.maxTokenBudget) * 100))

    if (globalPressure > 80) {
      recommendations.push(`🔴 Global pressure ${globalPressure}%. Recommend: compress memory, truncate history.`)
    } else if (globalPressure > 60) {
      recommendations.push(`🟡 Global pressure ${globalPressure}%. Monitor: degradation risk if exceeds 85%.`)
    }

    // Identify layers exceeding hard limits
    for (const [layerId, layer] of this.layers.entries()) {
      const usage = layer.currentUsage
      if (usage > layer.hardLimit) {
        recommendations.push(`Truncate ${layer.label} from ${usage} to ${layer.hardLimit} chars.`)
      }
    }

    return {
      totalChars,
      totalTokens,
      globalPressure,
      layerPressure,
      warnings,
      recommendations,
    }
  }

  public getPriorityOrder(): string[] {
    const sorted = Array.from(this.layers.values()).sort((a, b) => b.priority - a.priority)
    return sorted.map(layer => layer.id)
  }

  public shouldCompress(layerId: string): boolean {
    const layer = this.layers.get(layerId)
    if (!layer) return false
    return layer.currentUsage > layer.softLimit
  }

  public getLayerBudget(layerId: string): LayerBudget | undefined {
    const layer = this.layers.get(layerId)
    return layer ? { ...layer } : undefined
  }

  public getAvailableTokens(): number {
    const used = Array.from(this.layers.values()).reduce((sum, layer) => sum + layer.currentUsage, 0)
    const estimatedUsedTokens = Math.ceil(used * DEFAULT_TOKEN_PER_4_CHARS)
    return Math.max(0, this.maxTokenBudget - estimatedUsedTokens)
  }

  public getCompressionTargets(): Array<{ layerId: string; currentSize: number; targetSize: number; ratio: number }> {
    const targets: Array<{ layerId: string; currentSize: number; targetSize: number; ratio: number }> = []

    for (const [layerId, layer] of this.layers.entries()) {
      if (layer.currentUsage > layer.hardLimit) {
        const ratio = layer.hardLimit / layer.currentUsage
        targets.push({
          layerId,
          currentSize: layer.currentUsage,
          targetSize: layer.hardLimit,
          ratio,
        })
      }
    }

    return targets.sort((a, b) => a.ratio - b.ratio) // most aggressive compressions first
  }

  public resetUsage(): void {
    for (const layer of this.layers.values()) {
      layer.currentUsage = 0
    }
  }
}
