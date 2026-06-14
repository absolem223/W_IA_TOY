import React from 'react'
import { Widget } from './components/Widget'
import { CognitiveDevToolsConsole } from '../cognitive-devtools/CognitiveDevToolsConsole'
import { VoiceProviderComponent } from './services/voice'

export default function App(): React.ReactElement {
  const urlParams = new URLSearchParams(window.location.search)
  const isDevtools = urlParams.get('devtools') === 'true'

  if (isDevtools) {
    return <CognitiveDevToolsConsole />
  }

  return (
    <VoiceProviderComponent>
      <Widget />
    </VoiceProviderComponent>
  )
}

