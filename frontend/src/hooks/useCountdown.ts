import { useCallback, useEffect, useRef, useState } from 'react'

export function useCountdown(seconds: number, onComplete?: () => void) {
  const [remaining, setRemaining] = useState(seconds)
  const [running, setRunning] = useState(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const reset = useCallback(
    (total = seconds) => {
      setRemaining(total)
      setRunning(true)
    },
    [seconds],
  )

  useEffect(() => {
    if (!running) return
    if (remaining <= 0) {
      setRunning(false)
      onCompleteRef.current?.()
      return
    }
    const id = window.setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => window.clearTimeout(id)
  }, [running, remaining])

  const pause = useCallback(() => setRunning(false), [])
  const resume = useCallback(() => setRunning(true), [])

  return { remaining, running, reset, pause, resume }
}
