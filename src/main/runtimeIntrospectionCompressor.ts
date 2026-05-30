/**
 * Runtime Introspection Compressor: Reduces verbose introspection to essential signal.
 * Adapts content depth based on context pressure.
 */

export interface CompressedRuntimeIntrospection {
  mode: string
  fallbackActive: boolean
  authState: string
  pressure: number
  essentialWarnings: string[]
  compressedSize: number
  originalSize: number
}

interface RuntimeIntrospectionFull {
  summary?: string
  mode: string
  version?: string
  activeModel?: string
  fallbackActive: boolean
  authState: string
  tokenUsageEstimate?: number
  providerCount?: number
  providers?: Array<{ id: string; label: string; online: boolean; error?: string }>
  memoryStatus?: { turnCount: number; vaultCount: number; profileKeys: number }
  cognitiveState?: { activeTopic: string | null; contextPressure: number }
  architecture?: { activeModules: string[]; constraints: string[] }
  environmentWarnings?: Array<{ id: string; message: string }>
  providerErrors?: Array<{ providerId: string; type: string; message: string }>
  operationalGuidance?: string
}

export class RuntimeIntrospectionCompressor {
  /**
   * Compress introspection XML/JSON to minimal form.
   * Keeps critical diagnostics, drops verbose explanations.
   */
  public compress(input: RuntimeIntrospectionFull, globalPressure: number): CompressedRuntimeIntrospection {
    const essentialWarnings: string[] = []

    // Only include warnings if pressure is high or auth is invalid
    if (globalPressure > 70 || input.authState !== 'valid') {
      if (input.environmentWarnings) {
        essentialWarnings.push(
          ...input.environmentWarnings.slice(0, 2).map((w) => `${w.id}: ${w.message.substring(0, 60)}`)
        )
      }
    }

    if (input.fallbackActive) {
      essentialWarnings.push('fallback mode active')
    }

    if (input.providerErrors && input.providerErrors.length > 0) {
      essentialWarnings.push(
        `${input.providerErrors[0].providerId}: ${input.providerErrors[0].type.substring(0, 40)}`
      )
    }

    const compressed: CompressedRuntimeIntrospection = {
      mode: input.mode || 'runtime',
      fallbackActive: input.fallbackActive || false,
      authState: input.authState || 'unknown',
      pressure: globalPressure,
      essentialWarnings: essentialWarnings.slice(0, 3),
      compressedSize: 0,
      originalSize: 0,
    }

    compressed.compressedSize = this.estimateSize(compressed)
    compressed.originalSize = this.estimateSize(input)

    return compressed
  }

  /**
   * Generate minimal introspection line for very high pressure (>85%).
   */
  public compressToMinimal(input: RuntimeIntrospectionFull): string {
    const warnings = input.environmentWarnings ? `[${input.environmentWarnings.length} warnings]` : ''
    const fallback = input.fallbackActive ? '[fallback]' : ''
    const auth = input.authState !== 'valid' ? `[auth:${input.authState}]` : ''

    return `<!-- Runtime: ${input.mode} pressure=${input.tokenUsageEstimate ?? 0} ${auth}${fallback}${warnings} -->`.trim()
  }

  /**
   * Generate compacted introspection block (500-800 chars instead of 2300+).
   */
  public compressToCompact(input: RuntimeIntrospectionFull, globalPressure: number): string {
    const compressed = this.compress(input, globalPressure)

    const warnings = compressed.essentialWarnings.length > 0 ? `warnings: ${compressed.essentialWarnings.join(', ')}` : ''

    return `<runtime>
mode: ${compressed.mode}
pressure: ${compressed.pressure}%
auth: ${compressed.authState}
fallback: ${compressed.fallbackActive}
${warnings ? `${warnings}` : ''}
</runtime>`
  }

  /**
   * Selectively include sections based on pressure and priority.
   */
  public compressToAdaptive(input: RuntimeIntrospectionFull, globalPressure: number): string {
    if (globalPressure > 85) {
      return this.compressToMinimal(input)
    }

    if (globalPressure > 70) {
      return this.compressToCompact(input, globalPressure)
    }

    // Normal compression: keep diagnostic essentials
    const sections: string[] = ['<runtime_introspection>']

    sections.push(`mode: ${input.mode || 'runtime'}`)
    sections.push(`pressure: ${globalPressure}%`)
    sections.push(`auth: ${input.authState || 'unknown'}`)
    sections.push(`fallback: ${input.fallbackActive || false}`)

    if (input.activeModel) {
      sections.push(`activeModel: ${input.activeModel}`)
    }

    if (input.environmentWarnings && input.environmentWarnings.length > 0) {
      sections.push(`warnings: ${input.environmentWarnings.slice(0, 2).map((w) => w.id).join(', ')}`)
    }

    if (input.architecture && input.architecture.constraints && input.architecture.constraints.length > 0) {
      sections.push(`constraints: ${input.architecture.constraints.slice(0, 2).join(', ')}`)
    }

    sections.push('</runtime_introspection>')

    return sections.join('\n')
  }

  private estimateSize(obj: unknown): number {
    return JSON.stringify(obj).length
  }
}
