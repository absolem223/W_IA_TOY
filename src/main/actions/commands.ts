// ── Built-in Commands ────────────────────────────────────────
// All commands execute in the main process with sandboxed context.
// Each command declares category, permission, and optional confirmation.

import { registerAction, getAllActions, getHistory, getActionStats, executeConfirmation, cancelConfirmation, getActionsByCategory } from './registry'
import type { ActionResult } from './registry'
import { getRetrievalTelemetry } from '../memory/retrieval'

// ═══════════════════════════════════════════════════════════════
// CHAT COMMANDS
// ═══════════════════════════════════════════════════════════════

registerAction({
  name: 'help',
  aliases: ['h', '?'],
  description: 'List available commands',
  usage: '/help [category]',
  category: 'chat',
  permission: 'public',
  execute: async (args, _ctx): Promise<ActionResult> => {
    const category = args.trim().toLowerCase()

    if (category && ['chat', 'memory', 'system', 'debug'].includes(category)) {
      const actions = getActionsByCategory(category as any)
      if (actions.length === 0) return { success: true, message: `No commands in category "${category}".` }
      const lines = actions.map(a => {
        const aliases = a.aliases?.length ? ` (${a.aliases.map(al => '/' + al).join(', ')})` : ''
        return `/${a.name}${aliases} — ${a.description}`
      })
      return { success: true, message: `[${category}] commands:\n${lines.join('\n')}` }
    }

    const actions = getAllActions().filter(a => a.name !== 'confirm' && a.name !== 'cancel')
    const grouped: Record<string, string[]> = {}
    for (const a of actions) {
      if (!grouped[a.category]) grouped[a.category] = []
      const aliases = a.aliases?.length ? ` (${a.aliases.map(al => '/' + al).join(', ')})` : ''
      grouped[a.category].push(`  /${a.name}${aliases} — ${a.description}`)
    }
    const sections = Object.entries(grouped).map(([cat, cmds]) => `[${cat}]\n${cmds.join('\n')}`)
    return { success: true, message: sections.join('\n\n') }
  },
})

registerAction({
  name: 'cleanchat',
  aliases: ['clear', 'cls'],
  description: 'Clear chat history',
  usage: '/cleanchat',
  category: 'chat',
  permission: 'public',
  confirm: true,
  confirmMessage: 'Clear all chat history? This cannot be undone.',
  execute: async (_args, _ctx): Promise<ActionResult> => {
    return {
      success: true,
      message: '✓ Chat cleared',
      data: { action: 'clear_chat' },
    }
  },
})

// ═══════════════════════════════════════════════════════════════
// MEMORY COMMANDS
// ═══════════════════════════════════════════════════════════════

registerAction({
  name: 'memory',
  aliases: ['mem'],
  description: 'Show memory status summary',
  usage: '/memory',
  category: 'memory',
  permission: 'public',
  execute: async (_args, ctx): Promise<ActionResult> => {
    const status = ctx.memoryManager?.getStatus()
    if (!status) return { success: false, message: 'Memory system not initialized' }
    return {
      success: true,
      message: `🧠 Profile: ${status.profileKeys} · Vault: ${status.vaultCount} · Turns: ${status.turnCount}`,
    }
  },
})

registerAction({
  name: 'remember',
  aliases: ['save', 'r'],
  description: 'Save something to the vault',
  usage: '/remember Title | Content',
  category: 'memory',
  permission: 'public',
  execute: async (args, ctx): Promise<ActionResult> => {
    if (!args.trim()) return { success: false, message: 'Usage: /remember Title | Content' }
    if (!ctx.memoryManager) return { success: false, message: 'Memory system not initialized' }

    const pipeIdx = args.indexOf('|')
    const title = pipeIdx > 0 ? args.slice(0, pipeIdx).trim() : args.slice(0, 60).trim()
    const body = pipeIdx > 0 ? args.slice(pipeIdx + 1).trim() : args.trim()

    const result = await ctx.memoryManager.saveToVault(title, body, [])
    if (result.blocked) return { success: false, message: `Blocked: ${result.reason}` }
    return { success: true, message: `✓ Saved: "${title}"` }
  },
})

registerAction({
  name: 'whoami',
  description: 'Show active identity state',
  usage: '/whoami',
  category: 'debug',
  permission: 'public',
  execute: async (_args, ctx): Promise<ActionResult> => {
    if (!ctx.memoryManager) return { success: false, message: 'Memory not initialized' }
    const semantic = ctx.memoryManager.getProfile()
    
    let out = '[Identidad Canónica]\n'
    out += `Asistente: ${semantic.assistant?.assistant_name || 'Desconocido'}\n`
    out += `Rol: ${semantic.assistant?.assistant_role || 'companion'}\n`
    out += `Relación: ${semantic.assistant?.preferred_relationship || 'friend'}\n\n`
    
    out += '[Usuario]\n'
    out += `Nombre: ${semantic.profile.user_name?.value || 'No establecido'}`
    
    return { success: true, message: out }
  },
})

registerAction({
  name: 'debug-identity',
  description: 'Dump raw identity profiles',
  usage: '/debug-identity',
  category: 'debug',
  permission: 'public',
  execute: async (_args, ctx): Promise<ActionResult> => {
    if (!ctx.memoryManager) return { success: false, message: 'Memory not initialized' }
    const semantic = ctx.memoryManager.getProfile()
    
    return { 
      success: true, 
      message: `User Profile:\n${JSON.stringify(semantic.profile, null, 2)}\n\nAssistant Profile:\n${JSON.stringify(semantic.assistant, null, 2)}`
    }
  },
})

registerAction({
  name: 'forget',
  aliases: ['delete', 'del'],
  description: 'Delete a vault entry by title keyword',
  usage: '/forget <keyword>',
  category: 'memory',
  permission: 'elevated',
  confirm: true,
  confirmMessage: 'Delete this vault entry? This cannot be undone.',
  execute: async (args, ctx): Promise<ActionResult> => {
    const query = args.trim().toLowerCase()
    if (!query) return { success: false, message: 'Usage: /forget <keyword>' }
    if (!ctx.memoryManager) return { success: false, message: 'Memory system not initialized' }

    const entries = ctx.memoryManager.getVaultEntries()
    const match = entries.find(e => e.title.toLowerCase().includes(query))
    if (!match) return { success: false, message: `✕ No vault entry matching "${query}"` }

    await ctx.memoryManager.deleteFromVault(match.id)
    return { success: true, message: `✓ Deleted: "${match.title}"` }
  },
})

// ═══════════════════════════════════════════════════════════════
// SYSTEM COMMANDS
// ═══════════════════════════════════════════════════════════════

registerAction({
  name: 'health',
  aliases: ['status'],
  description: 'Show system health status',
  usage: '/health',
  category: 'system',
  permission: 'public',
  execute: async (_args, ctx): Promise<ActionResult> => {
    const mem = ctx.memoryManager?.getStatus()
    const retrieval = getRetrievalTelemetry()

    const lines = [
      `Memory: ${mem?.initialized ? '✓ initialized' : '✕ not initialized'}`,
      `Profile: ${mem?.profileKeys ?? 0} keys`,
      `Vault: ${mem?.vaultCount ?? 0} entries`,
      `Session turns: ${mem?.turnCount ?? 0}`,
      `Retrieval: ${retrieval.totalQueries}q, ${retrieval.totalHits} hits, ${retrieval.totalMisses} misses`,
    ]
    return { success: true, message: lines.join('\n'), data: { memory: mem, retrieval } }
  },
})

registerAction({
  name: 'history',
  aliases: ['hist'],
  description: 'Show recent command history',
  usage: '/history [count]',
  category: 'system',
  permission: 'public',
  execute: async (args, _ctx): Promise<ActionResult> => {
    const count = Math.min(Math.max(parseInt(args) || 10, 1), 50)
    const entries = getHistory().slice(-count)
    if (entries.length === 0) return { success: true, message: 'No command history yet.' }

    const lines = entries.map(e => {
      const status = e.result.success ? '✓' : '✕'
      const cmd = e.args ? `/${e.command} ${e.args}` : `/${e.command}`
      return `${status} ${cmd} (${e.durationMs}ms)`
    })
    return { success: true, message: lines.join('\n') }
  },
})

registerAction({
  name: 'stats',
  description: 'Show command usage statistics',
  usage: '/stats',
  category: 'system',
  permission: 'public',
  execute: async (_args, _ctx): Promise<ActionResult> => {
    const stats = getActionStats()
    const entries = Object.entries(stats)
    if (entries.length === 0) return { success: true, message: 'No stats yet.' }

    const lines = entries
      .sort((a, b) => b[1].count - a[1].count)
      .map(([cmd, s]) => `/${cmd}: ${s.count}x (${s.successes}✓ ${s.failures}✕) avg ${s.avgMs}ms`)
    return { success: true, message: lines.join('\n') }
  },
})

// ═══════════════════════════════════════════════════════════════
// CONFIRMATION COMMANDS (internal)
// ═══════════════════════════════════════════════════════════════

registerAction({
  name: 'confirm',
  aliases: ['yes', 'y'],
  description: 'Confirm a pending action',
  usage: '/confirm',
  category: 'system',
  permission: 'public',
  execute: async (args, _ctx): Promise<ActionResult> => {
    const confirmId = args.trim()
    return executeConfirmation(confirmId || undefined)
  },
})

registerAction({
  name: 'cancel',
  aliases: ['no', 'n'],
  description: 'Cancel a pending action',
  usage: '/cancel',
  category: 'system',
  permission: 'public',
  execute: async (args, _ctx): Promise<ActionResult> => {
    const confirmId = args.trim()
    return cancelConfirmation(confirmId || undefined)
  },
})

// ═══════════════════════════════════════════════════════════════
// DEBUG COMMANDS
// ═══════════════════════════════════════════════════════════════

registerAction({
  name: 'debug-memory',
  description: 'Run memory integrity check',
  usage: '/debug-memory',
  category: 'debug',
  permission: 'debug',
  execute: async (_args, ctx): Promise<ActionResult> => {
    if (!ctx.memoryManager) return { success: false, message: 'Memory system not initialized' }

    try {
      await ctx.memoryManager.runIntegrityCheck()
      const status = ctx.memoryManager.getStatus()
      return {
        success: true,
        message: `✓ Integrity check passed. P:${status.profileKeys} V:${status.vaultCount} T:${status.turnCount}`,
      }
    } catch (err) {
      return { success: false, message: `Integrity check failed: ${err instanceof Error ? err.message : 'unknown'}` }
    }
  },
})

registerAction({
  name: 'debug-retrieval',
  description: 'Show retrieval telemetry stats',
  usage: '/debug-retrieval',
  category: 'debug',
  permission: 'debug',
  execute: async (_args, _ctx): Promise<ActionResult> => {
    const t = getRetrievalTelemetry()
    const lines = [
      `Queries: ${t.totalQueries}`,
      `Hits: ${t.totalHits}`,
      `Misses: ${t.totalMisses}`,
      `Snippets used: ${t.totalSnippetsUsed}`,
      `Deduped: ${t.totalDeduped}`,
      `Capped: ${t.totalCapped}`,
      `Avg snippets/query: ${t.totalQueries > 0 ? (t.totalSnippetsUsed / t.totalQueries).toFixed(2) : 'n/a'}`,
    ]
    return { success: true, message: lines.join('\n') }
  },
})

// ═══════════════════════════════════════════════════════════════
// VOICE COMMANDS
// ═══════════════════════════════════════════════════════════════

registerAction({
  name: 'voice',
  description: 'Manage voice settings, stop playback, or switch providers',
  usage: '/voice [on|off|stop|provider <name>|provider list]',
  category: 'system',
  permission: 'public',
  execute: async (args, ctx): Promise<ActionResult> => {
    if (!ctx.voiceManager) return { success: false, message: 'Voice system not initialized' }

    const cleanArgs = args.trim()
    if (!cleanArgs) {
      // Show status
      const status = ctx.voiceManager.getStatus()
      const telemetry = ctx.voiceManager.getTelemetry()
      const lines = [
        `Voice: ${status.enabled ? '✓ enabled' : '✕ disabled'}`,
        `Muted: ${status.muted ? 'yes' : 'no'}`,
        `State: ${status.state}`,
        `Provider: ${status.currentProvider}`,
        `Requests: ${telemetry.totalSpeakRequests}`,
        `Chars spoken: ${telemetry.totalCharsSpoken}`,
        `Cancellations: ${telemetry.totalCancellations}`,
        `Errors: ${telemetry.totalErrors}`,
      ]
      return { success: true, message: lines.join('\n') }
    }

    const parts = cleanArgs.split(/\s+/)
    const sub = parts[0].toLowerCase()

    if (sub === 'on') {
      ctx.voiceManager.updateConfig({ enabled: true })
      return { success: true, message: '🔊 Voice enabled' }
    }
    if (sub === 'off') {
      ctx.voiceManager.updateConfig({ enabled: false })
      return { success: true, message: '🔇 Voice disabled' }
    }
    if (sub === 'stop') {
      ctx.voiceManager.stop()
      return { success: true, message: '⏹ Voice playback stopped and queue cleared.' }
    }
    if (sub === 'provider') {
      const providerArg = parts.slice(1).join(' ').trim().toLowerCase()
      if (!providerArg) {
        return { success: false, message: 'Usage: /voice provider <name>|list' }
      }
      if (providerArg === 'list') {
        const providers = ctx.voiceManager.getRegisteredProviders()
        const lines = providers.map(p => `  • ${p.id} (${p.name}) [${p.type}]`)
        return { success: true, message: `Registered Voice Providers:\n${lines.join('\n')}` }
      }

      const providers = ctx.voiceManager.getRegisteredProviders()
      const match = providers.find(p => p.id.toLowerCase() === providerArg || p.name.toLowerCase() === providerArg)
      if (!match) {
        return { success: false, message: `✕ Unknown voice provider "${providerArg}". Use "/voice provider list" to see registered providers.` }
      }

      ctx.voiceManager.updateConfig({ providerId: match.id })
      return { success: true, message: `✓ Voice provider switched to: ${match.name} (${match.id})` }
    }

    return { success: false, message: 'Usage: /voice [on|off|stop|provider <name>|provider list]' }
  },
})

registerAction({
  name: 'mute',
  description: 'Mute voice output',
  usage: '/mute',
  category: 'system',
  permission: 'public',
  execute: async (_args, ctx): Promise<ActionResult> => {
    if (!ctx.voiceManager) return { success: false, message: 'Voice system not initialized' }
    ctx.voiceManager.updateConfig({ muted: true })
    return { success: true, message: '🔇 Voice muted' }
  },
})

registerAction({
  name: 'unmute',
  description: 'Unmute voice output',
  usage: '/unmute',
  category: 'system',
  permission: 'public',
  execute: async (_args, ctx): Promise<ActionResult> => {
    if (!ctx.voiceManager) return { success: false, message: 'Voice system not initialized' }
    ctx.voiceManager.updateConfig({ muted: false })
    return { success: true, message: '🔊 Voice unmuted' }
  },
})

registerAction({
  name: 'voice-debug',
  description: 'Show detailed voice system diagnostics',
  usage: '/voice-debug',
  category: 'debug',
  permission: 'debug',
  execute: async (_args, ctx): Promise<ActionResult> => {
    if (!ctx.voiceManager) return { success: false, message: 'Voice system not initialized' }

    const status = ctx.voiceManager.getStatus()
    const telemetry = ctx.voiceManager.getTelemetry()

    const avgPlaybackMs = telemetry.totalSpeakRequests > 0
      ? Math.round(telemetry.totalPlaybackMs / telemetry.totalSpeakRequests)
      : 0

    const lines = [
      '── Voice Debug ──────────────────────',
      '',
      '◆ State Machine',
      `  State: ${status.state}`,
      `  Pending requestId: ${status.currentRequestId || 'none'}`,
      `  Current text: ${status.currentText ? status.currentText.slice(0, 50) + '…' : 'none'}`,
      '',
      '◆ Config',
      `  Enabled: ${status.enabled}`,
      `  Muted: ${status.muted}`,
      `  Provider: ${status.currentProvider}`,
      `  VoiceId: ${status.currentVoiceId || '(system default)'}`,
      '',
      '◆ Telemetry',
      `  Speak requests: ${telemetry.totalSpeakRequests}`,
      `  Replacements: ${telemetry.totalReplacements}`,
      `  Cancellations: ${telemetry.totalCancellations}`,
      `  Timeouts: ${telemetry.totalTimeouts}`,
      `  Errors: ${telemetry.totalErrors}`,
      `  Chars spoken: ${telemetry.totalCharsSpoken}`,
      `  Total playback: ${(telemetry.totalPlaybackMs / 1000).toFixed(1)}s`,
      `  Last playback: ${telemetry.lastPlaybackDurationMs}ms`,
      `  Avg playback: ${avgPlaybackMs}ms`,
      `  Last requestId: ${telemetry.lastRequestId || 'none'}`,
      `  Last error: ${telemetry.lastError || 'none'}`,
      '',
      '◆ Cloud TTS Telemetry',
      `  Total audio size: ${(telemetry.totalAudioSizeBytes / 1024).toFixed(1)} KB`,
      `  Last latency: ${telemetry.lastGenerationLatencyMs}ms`,
      `  Last audio size: ${(telemetry.lastAudioSizeBytes / 1024).toFixed(1)} KB`,
      '',
      '◆ Provider usage',
      ...Object.entries(telemetry.providerUsage).map(([k, v]) => `  ${k}: ${v} requests`),
    ]

    if (Object.keys(telemetry.providerUsage).length === 0) {
      lines.push('  (no provider calls yet)')
    }

    return { success: true, message: lines.join('\n') }
  },
})

registerAction({
  name: 'voice-test',
  description: 'Force a TTS playback test bypassing the LLM',
  usage: '/voice-test',
  category: 'system',
  permission: 'public',
  execute: async (_args, ctx): Promise<ActionResult> => {
    if (!ctx.voiceManager) return { success: false, message: 'Voice system not initialized' }

    try {
      const res = await ctx.voiceManager.speak("El sistema de voz está funcionando correctamente.", "test-req-" + Date.now())
      if (!res.success) {
        return { success: false, message: `Error TTS: ${res.error}` }
      }
      return { success: true, message: '🔊 Test TTS enviado al renderer.' }
    } catch (err) {
      return { success: false, message: `Error en TTS test: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
})

registerAction({
  name: 'voice-stress',
  description: 'Trigger a rapid voice pipeline stress test',
  usage: '/voice-stress [count]',
  category: 'debug',
  permission: 'debug',
  execute: async (args, ctx): Promise<ActionResult> => {
    if (!ctx.voiceManager) return { success: false, message: 'Voice system not initialized' }

    const count = Math.min(Math.max(parseInt(args) || 5, 2), 20)
    ctx.logger.info(`[VOICE_STRESS] Starting stress test with ${count} rapid messages...`)

    let sent = 0
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    for (let i = 1; i <= count; i++) {
      const msg = `Mensaje de prueba número ${i} de ${count}.`
      await ctx.voiceManager.speak(msg)
      sent++
      if (i < count) {
        await delay(50) // 50ms gap
      }
    }

    return {
      success: true,
      message: `⚡ Stress test triggered: sent ${sent} speak requests with 50ms gaps. Check voice-debug or system log for output. Only the last message should play.`,
    }
  },
})

registerAction({
  name: 'llm',
  description: 'Manage LLM provider, model, and capabilities',
  usage: '/llm [status | provider <id> | model <id> | set <key> <value>]',
  category: 'system',
  permission: 'public',
  execute: async (args, ctx): Promise<ActionResult> => {
    if (!ctx.llmManager) return { success: false, message: 'LLM system not initialized' }

    const cleanArgs = args.trim()
    if (!cleanArgs || cleanArgs === 'status') {
      const status = ctx.llmManager.getStatus()
      const settings = ctx.llmManager.getSettings()
      
      const lines = [
        `🤖 Current Provider: ${status.activeProviderId}`,
        `📄 Current Model: ${status.activeModelId}`,
        `⚡ Available Providers: ${status.availableProviders.join(', ')}`,
        `⚙ Settings:`,
        `  • temperature: ${settings.temperature}`,
        `  • maxTokens: ${settings.maxTokens}`,
        `  • providerUrl: ${settings.providerUrl || '(default)'}`,
        `🧠 Active Provider Capabilities:`,
        ...Object.entries(status.capabilities || {}).map(([k, v]) => `  • ${k}: ${v ? '✓' : '✕'}`)
      ]
      return { success: true, message: lines.join('\n') }
    }

    const parts = cleanArgs.split(/\s+/)
    const sub = parts[0].toLowerCase()

    if (sub === 'provider') {
      const providerId = parts.slice(1).join(' ').trim()
      if (!providerId) return { success: false, message: 'Usage: /llm provider <providerId>' }

      try {
        await ctx.llmManager.updateConfig({ providerId })
        const status = ctx.llmManager.getStatus()
        return { 
          success: true, 
          message: `✓ Inference provider changed to: ${status.activeProviderId}\nModel updated to: ${status.activeModelId}` 
        }
      } catch (err: any) {
        return { success: false, message: `✕ Failed to change provider: ${err.message}` }
      }
    }

    if (sub === 'model') {
      const modelId = parts.slice(1).join(' ').trim()
      if (!modelId) return { success: false, message: 'Usage: /llm model <modelId>' }

      try {
        await ctx.llmManager.updateConfig({ modelId })
        const status = ctx.llmManager.getStatus()
        return { 
          success: true, 
          message: `✓ Model changed to: ${status.activeModelId} (Provider: ${status.activeProviderId})` 
        }
      } catch (err: any) {
        return { success: false, message: `✕ Failed to change model: ${err.message}` }
      }
    }

    if (sub === 'set') {
      const key = parts[1]?.toLowerCase()
      const valStr = parts.slice(2).join(' ').trim()
      if (!key || !valStr) return { success: false, message: 'Usage: /llm set <key> <value>' }

      const updates: any = {}
      if (key === 'temperature') {
        const val = parseFloat(valStr)
        if (isNaN(val)) return { success: false, message: 'Temperature must be a number' }
        updates.temperature = val
      } else if (key === 'maxtokens') {
        const val = parseInt(valStr, 10)
        if (isNaN(val)) return { success: false, message: 'maxTokens must be an integer' }
        updates.maxTokens = val
      } else if (key === 'providerurl') {
        updates.providerUrl = valStr === 'null' || valStr === 'undefined' ? null : valStr
      } else {
        return { success: false, message: `✕ Unknown settings key: ${key}. Supported keys: temperature, maxTokens, providerUrl` }
      }

      try {
        await ctx.llmManager.updateConfig(updates)
        return { success: true, message: `✓ Updated setting ${key} to ${valStr}` }
      } catch (err: any) {
        return { success: false, message: `✕ Failed to update settings: ${err.message}` }
      }
    }

    return { success: false, message: 'Usage: /llm [status | provider <id> | model <id> | set <key> <value>]' }
  }
})
