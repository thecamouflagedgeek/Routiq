/**
 * Shared types for the Sleep Drive Conversation Manager.
 *
 * The manager owns: turn-taking, barge-in, language preference, music
 * permission, cooldowns and the bounded conversation history. The fatigue
 * engine stays completely separate — it consumes events, the manager owns
 * WHEN/WHETHER Routiq speaks.
 */
import type { ConversationStateName, DriverIntent } from '../../types'

/** UI phase — how SleepDrive.tsx renders (kept compatible with the earlier
 *  hook so the page layout is untouched). */
export type SleepPhase =
  | 'idle'
  | 'starting'
  | 'intro'
  | 'waiting'
  | 'analyzing'
  | 'quiet' // driver appears engaged — assistant intentionally silent
  | 'paused'
  | 'alert'

export type MusicConsent = 'idle' | 'pending' | 'accepted' | 'declined'

export type QuestionSource = 'ai' | 'scripted'

export interface LatencyResult {
  latency: number
  band: 'NORMAL' | 'MILD' | 'ELEVATED' | 'SEVERE'
  color: string
  label: string
  transcript: string
}

export interface ConversationTurn {
  role: 'driver' | 'routiq'
  text: string
  intent?: DriverIntent | string
  at: number // performance.now() timestamp
}

/** React-facing snapshot the hook mirrors into state. */
export interface ManagerState {
  phase: SleepPhase
  conversationState: ConversationStateName
  question: string
  transcript: string
  elapsed: number
  listening: boolean
  micBlocked: boolean
  musicConsent: MusicConsent
  cooldownRemaining: number
  questionSource: QuestionSource
  lastLatency: LatencyResult | null
  language: string
  /** the opening "which language?" step is awaiting the driver's reply */
  awaitingLanguage: boolean
  history: ConversationTurn[]
  aiAvailable: boolean | null
  speaking: boolean
  lastIntent: string
  lastAction: { type: string } | null
}
