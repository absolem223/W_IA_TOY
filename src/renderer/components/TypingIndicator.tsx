import React from 'react'

interface Props {
  status?: string
}

export function TypingIndicator({ status }: Props): React.ReactElement {
  return (
    <div className="typing-indicator" aria-label={status || 'Pensando…'}>
      {status ? (
        <span className="cognitive-status-text">{status}</span>
      ) : (
        <>
          <span />
          <span />
          <span />
        </>
      )}
    </div>
  )
}
