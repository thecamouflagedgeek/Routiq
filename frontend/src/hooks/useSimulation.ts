import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLng, RouteResponse, Segment } from '../types'

// Speed in simulation steps per second (each step advances ~1 geometry point)
const STEPS_PER_SECOND = 3

export type SimPhase = 'idle' | 'running' | 'paused' | 'finished'

// Demo phases tied to % progress through the route
// Phase 1: 0–35% — normal driver
// Phase 2: 35–65% — mild concern, moderate road
// Phase 3: 65–100% — elevated fatigue + high risk segment

export interface SimState {
  phase: SimPhase
  position: LatLng | null          // current vehicle [lat, lon]
  positionIndex: number            // index into route.geometry
  progress: number                 // 0–1
  currentSegment: Segment | null
  nextSegment: Segment | null
  currentSegmentIndex: number
  demoPhase: 1 | 2 | 3            // scripted driver state phase
}

function findSegmentForIndex(
  posIndex: number,
  route: RouteResponse,
): { seg: Segment | null; idx: number } {
  const totalPts = route.geometry.length
  const normalised = posIndex / Math.max(1, totalPts - 1) // 0–1

  // Find the segment whose geometry contains this position
  let accumulated = 0
  for (let i = 0; i < route.segments.length; i++) {
    const seg = route.segments[i]
    const segFraction = seg.geometry.length / Math.max(1, totalPts)
    const start = accumulated
    const end = accumulated + segFraction
    if (normalised <= end || i === route.segments.length - 1) {
      return { seg, idx: i }
    }
    accumulated = end
  }
  return { seg: route.segments[route.segments.length - 1] ?? null, idx: route.segments.length - 1 }
}

export function useSimulation(route: RouteResponse | null) {
  const [state, setState] = useState<SimState>({
    phase: 'idle',
    position: null,
    positionIndex: 0,
    progress: 0,
    currentSegment: null,
    nextSegment: null,
    currentSegmentIndex: 0,
    demoPhase: 1,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const phaseRef = useRef<SimPhase>('idle')
  const indexRef = useRef(0)

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    if (!route || phaseRef.current !== 'running') return
    const geo = route.geometry
    const totalPts = geo.length
    indexRef.current = Math.min(indexRef.current + 1, totalPts - 1)
    const idx = indexRef.current
    const progress = idx / Math.max(1, totalPts - 1)

    const { seg, idx: segIdx } = findSegmentForIndex(idx, route)
    const nextSeg = route.segments[segIdx + 1] ?? null

    const demoPhase: 1 | 2 | 3 =
      progress < 0.35 ? 1 : progress < 0.65 ? 2 : 3

    setState(prev => ({
      ...prev,
      position: [geo[idx][0], geo[idx][1]],
      positionIndex: idx,
      progress,
      currentSegment: seg,
      nextSegment: nextSeg,
      currentSegmentIndex: segIdx,
      demoPhase,
    }))

    if (idx >= totalPts - 1) {
      phaseRef.current = 'finished'
      clearTick()
      setState(prev => ({ ...prev, phase: 'finished' }))
    }
  }, [route, clearTick])

  const start = useCallback(() => {
    if (!route) return
    indexRef.current = 0
    phaseRef.current = 'running'
    const geo = route.geometry
    setState({
      phase: 'running',
      position: [geo[0][0], geo[0][1]],
      positionIndex: 0,
      progress: 0,
      currentSegment: route.segments[0] ?? null,
      nextSegment: route.segments[1] ?? null,
      currentSegmentIndex: 0,
      demoPhase: 1,
    })
    clearTick()
    intervalRef.current = setInterval(tick, 1000 / STEPS_PER_SECOND)
  }, [route, clearTick, tick])

  const pause = useCallback(() => {
    phaseRef.current = 'paused'
    clearTick()
    setState(prev => ({ ...prev, phase: 'paused' }))
  }, [clearTick])

  const resume = useCallback(() => {
    if (!route || phaseRef.current === 'running') return
    phaseRef.current = 'running'
    setState(prev => ({ ...prev, phase: 'running' }))
    clearTick()
    intervalRef.current = setInterval(tick, 1000 / STEPS_PER_SECOND)
  }, [route, clearTick, tick])

  const reset = useCallback(() => {
    clearTick()
    phaseRef.current = 'idle'
    indexRef.current = 0
    setState({
      phase: 'idle',
      position: null,
      positionIndex: 0,
      progress: 0,
      currentSegment: null,
      nextSegment: null,
      currentSegmentIndex: 0,
      demoPhase: 1,
    })
  }, [clearTick])

  // cleanup
  useEffect(() => () => clearTick(), [clearTick])

  // reset when route changes
  useEffect(() => {
    reset()
  }, [route, reset])

  return { sim: state, start, pause, resume, reset }
}
