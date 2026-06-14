import React, { createContext, useContext, useEffect, useMemo } from 'react'
import { VoiceService } from './VoiceService'
import { DummyProvider } from './providers/DummyProvider'
import { MediaRecorderProvider } from './providers/MediaRecorderProvider'
import { voiceConfig } from '../../../config/voice'
import type { VoiceProvider } from './types'

const VoiceContext = createContext<VoiceService | null>(null)

interface Props {
  children: React.ReactNode
}

export function VoiceProviderComponent({ children }: Props): React.ReactElement {
  const service = useMemo(() => {
    let provider: VoiceProvider

    switch (voiceConfig.provider) {
      case 'media-recorder':
        provider = new MediaRecorderProvider()
        break
      case 'dummy':
      default:
        provider = new DummyProvider()
        break
    }


    console.info(`[VoiceContext] Initializing VoiceService with provider: ${provider.id}`)
    return new VoiceService(provider)
  }, [])

  useEffect(() => {
    return () => {
      console.info('[VoiceContext] Destroying VoiceService')
      service.destroy()
    }
  }, [service])

  return (
    <VoiceContext.Provider value={service}>
      {children}
    </VoiceContext.Provider>
  )
}

export function useVoiceService(): VoiceService {
  const context = useContext(VoiceContext)
  if (!context) {
    throw new Error('useVoiceService must be used within a VoiceProvider')
  }
  return context
}
