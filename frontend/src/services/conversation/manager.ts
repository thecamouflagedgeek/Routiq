/**
 * ConversationManager — the conversational brain of Sleep Drive.
 *
 * It owns:
 *   - turn-taking: proactive prompts (AI -> driver) AND driver-initiated
 *     turns (driver -> AI) are both first-class paths
 *   - barge-in: if Routiq is speaking and the driver starts speaking, the
 *     TTS is interrupted and the driver is prioritized
 *   - the music permission state machine (music NEVER auto-starts)
 *   - language preference + mid-session switching (no session restart)
 *   - cooldowns / prompt pacing (quiet monitoring by default)
 *   - the bounded rolling conversation history
 *
 * It deliberately does NOT touch the fatigue engine: the engine consumes
 * events and decides driver STATE; the manager decides WHEN/WHETHER Routiq
 * speaks. The LLM proposes WHAT to say and an intent; the policy layer here
 * decides whether any ACTION (music, emergency, route) is permitted.
 *
 * The hook (useFatigue.ts) is a thin React adapter: it wires the transport,
 * api + engine, then mirrors this manager's state into React.
 *
 * ---------------------------------------------------------------------
 * FIX LOG (audio pipeline reliability pass)
 * ---------------------------------------------------------------------
 * 1. driverInitiatedFlow() previously called setPhase('analyzing') and had
 *    NO path back to 'quiet' on the driver-initiated branch (only the
 *    prompt/response branch in onDriverSpeech() closed the loop). Every
 *    exit of driverInitiatedFlow (success reply, catch fallback, and the
 *    two early-return actions) left `phase` stuck at 'analyzing' forever.
 *    Because onDriverSpeech() guards on `this.phase === 'analyzing'`, the
 *    mic kept capturing audio just fine but every subsequent transcript
 *    was silently discarded — this was the "mic dies after ~2 turns" bug.
 *    Fix: speakText() now takes an onComplete callback and every reply
 *    path in driverInitiatedFlow explicitly returns to 'quiet' (via
 *    setPhase, which also re-arms t.ask() in live mode) once Routiq
 *    actually finishes speaking. Only the music/emergency action paths
 *    are exempt, since they hand control to a different explicit
 *    transition (issuePrompt -> 'waiting', or onEmergency()).
 *
 * 2. speakText() previously fell back to browser speechSynthesis
 *    (speakBrowser) whenever Sarvam returned a non-Sarvam source, the
 *    fetch rejected, or a 2.5s timer elapsed first. That is a silent,
 *    ungated provider switch — exactly the "audio mixing" behavior that
 *    must never happen. Sarvam is now the only TTS provider with no
 *    hidden fallback: a failure emits a `tts_failed` event (for the UI /
 *    diagnostics to surface "Voice response unavailable. Please try
 *    again.") and returns the turn to LISTENING without producing any
 *    audio. speakBrowser() has been removed — it has no remaining caller.
 */
import { api } from '../api'
import type { AudioTransport } from '../audio/transport'
import { CRITICAL_MESSAGE, promptIntervalFor } from '../fatigue/engine'
import { DEMO_SILENCE_PROMPT } from '../fatigue/demoScript'
import type { DemoStep } from '../fatigue/demoScript'
import { DEMO_SCRIPT } from '../fatigue/demoScript'
import { latencyBand } from '../../config'
import {
  classifyIntentClient,
  classifyMusicIntent,
  INTRO,
  isMusicOffer,
  isTtsEcho,
  MUSIC_OFFER,
  scriptedForIntent,
  scriptedReply,
  targetLanguage,
} from './phrases'
import type { LatencyResult, ManagerState, MusicConsent, QuestionSource, SleepPhase } from './types'
import type {
  DriverState,
  FatigueEventType,
  FatigueThresholds,
  RoadContext,
} from '../../types'

export interface EventInput {
  event_type: FatigueEventType
  latency_ms?: number | null
  response_duration_ms?: number | null
  speech_confidence?: number | null
  speech_rate_wpm?: number | null
  transcript?: string | null
  prompt_id?: string | null
  error_code?: string | null
  language?: string | null
  intent?: string | null
  simulated?: boolean
}

export interface ManagerDeps {
  emitEvent: (ev: EventInput) => Promise<DriverState>
  thresholds: () => FatigueThresholds
  getDriver: () => DriverState
  applyDriver: (d: DriverState) => void
  scriptedNextPrompt: () => string
  mode: () => 'live' | 'demo'
  setMode: (m: 'live' | 'demo') => void
  sessionId: () => string
  setSessionId: (id: string) => void
  sessionStart: () => number | null
  setSessionStart: (t: number | null) => void
  isActive: () => boolean
  setActive: (a: boolean) => void
  transport: () => AudioTransport | null
  onState: (s: ManagerState) => void
  roadContext: () => RoadContext | null
  onEmergency: () => void
}

const MAX_HISTORY = 12

export class ConversationManager {
  private pushTurn(role: 'driver' | 'routiq', text: string, intent?: string) {
    this.history = [
      ...this.history.slice(-(MAX_HISTORY - 1)),
      { role, text, at: performance.now(), intent },
    ]
    this.turnCount += 1
  }
  private deps: ManagerDeps

  // --- runtime state -----------------------------------------------------
  private phase: SleepPhase = 'idle'
  private question = ''
  private transcript = ''
  private elapsed = 0
  private lastLatency: LatencyResult | null = null
  private questionSource: QuestionSource = 'scripted'
  private musicConsent: MusicConsent = 'idle'
  private language: string
  private history: ManagerState['history'] = []
  private aiAvailable: boolean | null = null
  private speaking = false
  private lastIntent = ''
  private lastAction: { type: string } | null = null
  /** dev diagnostics: total turns pushed into history this session */
  private turnCount = 0

  // --- refs --------------------------------------------------------------
  private questionStartRef = 0
  private promptIdRef = ''
  private nextPromptAt: number | null = null
  private ttsEnabled = true
  private aiEnabled = true
  private timers: number[] = []
  private demoTimers: number[] = []
  private waitingInterval: number | null = null
  private cooldownInterval: number | null = null
  private checkInInterval: number | null = null
  /** guards against overlapping turns (double ASR results, rapid fire) */
  private handlingTurn = false
  /** rotates through the short acknowledgement phrases */
  private ackSeed = 0
  /** text currently being spoken — used to filter the TTS echo out of barge-in */
  private currentTtsText = ''
  /** when the last TTS utterance finished — the echo lingers in the room and
   *  the mic keeps hearing it, so the echo filter stays armed briefly after */
  private lastTtsEndAt = 0
  /** speechstart during TTS arms a barge-in candidate; only a real driver
   *  result (not the echo) confirms it */
  private bargeCandidate = false
  private bargeDebounce: number | null = null

  constructor(deps: ManagerDeps) {
    this.deps = deps
    let saved = 'auto'
    try {
      saved = localStorage.getItem('roadsafe.language') || 'auto'
    } catch {
      /* noop */
    }
    this.language = saved
  }

  // ------------------------------------------------------------ snapshot
  private snapshot(): ManagerState {
    return {
      phase: this.phase,
      conversationState: this.conversationState(),
      question: this.question,
      transcript: this.transcript,
      elapsed: this.elapsed,
      listening: false,
      micBlocked: false,
      musicConsent: this.musicConsent,
      cooldownRemaining: this.cooldownRemaining(),
      questionSource: this.questionSource,
      lastLatency: this.lastLatency,
      language: this.language,
      history: [...this.history],
      aiAvailable: this.aiAvailable,
      speaking: this.speaking,
      lastIntent: this.lastIntent,
      lastAction: this.lastAction,
    }
  }

  private emit() {
    this.deps.onState(this.snapshot())
  }

  private setPhase(p: SleepPhase) {
    this.phase = p
    if (p === 'quiet') {
      // clearTimers() (timeout / response) kills the pacing loops — restart
      // them on every re-entry into quiet monitoring so the closed loop
      // keeps running: respond -> quiet -> interval -> gentle check-in.
      this.startCooldownLoop()
      this.startCheckInScheduler()
      // Re-arm the mic: stopListening() during the turn left it dead, and a
      // driver must be able to initiate a conversation at ANY moment. (Live
      // only — the demo is fully scripted and must stay deterministic.)
      if (this.deps.mode() === 'live') this.deps.transport()?.ask()
    }
    this.emit()
  }

  /** Rich conversation state for the UI label (Listening / speaking / quiet…). */
  private conversationState(): ManagerState['conversationState'] {
    if (this.phase === 'idle') return 'IDLE'
    if (this.phase === 'paused') return 'IDLE' // paused — monitoring on hold
    if (this.phase === 'alert') return 'ESCALATION'
    if (this.phase === 'starting' || this.phase === 'intro') return 'CHECK_IN'
    if (this.phase === 'waiting') return this.musicConsent === 'pending' ? 'MUSIC_PERMISSION' : 'WAITING_FOR_RESPONSE'
    if (this.phase === 'analyzing') return 'PROCESSING'
    if (this.speaking) return 'AI_SPEAKING'
    if (this.phase === 'quiet') return 'QUIET_MONITORING'
    return 'LISTENING'
  }

  private cooldownRemaining(): number {
    if (this.nextPromptAt == null) return 0
    return Math.max(0, (this.nextPromptAt - Date.now()) / 1000)
  }

  // ------------------------------------------------------------- timers
  private later(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms)
    this.timers.push(id)
  }

  private demoLater(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms)
    this.demoTimers.push(id)
  }

  private clearTimers() {
    this.timers.forEach((id) => window.clearTimeout(id))
    this.timers = []
    if (this.waitingInterval != null) {
      window.clearInterval(this.waitingInterval)
      this.waitingInterval = null
    }
    if (this.cooldownInterval != null) {
      window.clearInterval(this.cooldownInterval)
      this.cooldownInterval = null
    }
    if (this.checkInInterval != null) {
      window.clearInterval(this.checkInInterval)
      this.checkInInterval = null
    }
  }

  private clearDemoTimers() {
    this.demoTimers.forEach((id) => window.clearTimeout(id))
    this.demoTimers = []
  }

  // ------------------------------------------------------------- speech
  private armBargeIn() {
    this.bargeCandidate = true
    if (this.bargeDebounce != null) window.clearTimeout(this.bargeDebounce)
    this.bargeDebounce = window.setTimeout(() => {
      this.bargeCandidate = false
      this.bargeDebounce = null
    }, 700)
  }

  private disarmBargeIn() {
    this.bargeCandidate = false
    if (this.bargeDebounce != null) {
      window.clearTimeout(this.bargeDebounce)
      this.bargeDebounce = null
    }
  }

  /**
   * Sarvam TTS — the ONLY spoken-output path. There is deliberately no
   * hidden browser-speech fallback here: if Sarvam fails, we surface a
   * `tts_failed` event (for the UI: "Voice response unavailable. Please
   * try again.") and return control to LISTENING with no audio at all,
   * rather than silently switching voice providers mid-session.
   */
  private speakText(text: string, opts?: { rate?: number; onComplete?: () => void }) {
    if (!this.ttsEnabled) {
      opts?.onComplete?.()
      return
    }
    this.currentTtsText = text
    const t = this.deps.transport()
    if (!t) {
      opts?.onComplete?.()
      return
    }
    const language = this.language === 'auto' ? 'en-IN' : this.language
    const complete = () => {
      this.speaking = false
      this.lastTtsEndAt = performance.now()
      this.emit()
      opts?.onComplete?.()
    }
    this.speaking = true
    this.emit()

    const onTtsFailure = (reason: string) => {
      if (!this.deps.isActive()) return
      this.deps
        .emitEvent({ event_type: 'tts_failed', error_code: reason, transcript: text, language })
        .catch(() => {})
      // Surface to the UI diagnostics / status strip; the mic is NOT
      // affected — TTS failure must never kill listening.
      this.lastAction = { type: 'tts_error' }
      this.emit()
      complete()
    }

    api
      .fatigueTTS(text, language)
      .then((res) => {
        if (!this.deps.isActive()) return
        if (res.audio_base64 && res.source === 'sarvam') {
          this.deps.emitEvent({ event_type: 'tts_started', transcript: text, language }).catch(() => {})
          // Mic stays alive through playback — MIC and TTS are separate
          // lifecycles. t.ask() re-arms listening for barge-in immediately.
          t.ask()
          t.playRemoteAudio(res.audio_base64, res.format, complete)
          return
        }
        onTtsFailure(res.source ? `unexpected-provider:${res.source}` : 'no-audio')
      })
      .catch(() => onTtsFailure('request-failed'))
  }

  /** Driver began speaking while we were talking — interrupt TTS.
   *  Only called after a confirmed (non-echo) driver result. */
  private bargeIn() {
    if (!this.speaking) return
    const t = this.deps.transport()
    this.speaking = false
    this.disarmBargeIn()
    this.currentTtsText = ''
    this.emit()
    this.deps.emitEvent({ event_type: 'tts_interrupted' }).catch(() => {})
    t?.stopSpeaking()
  }

  // ------------------------------------------------------------ prompts
  private async pickQuestion(): Promise<{ text: string; source: QuestionSource }> {
    const scripted = this.deps.scriptedNextPrompt()
    if (this.aiEnabled && this.aiAvailable && this.deps.mode() === 'live') {
      const ai = await Promise.race([
        api
          .fatigueChat({
            intent: 'question',
            session_id: this.deps.sessionId() || undefined,
            messages: this.history.map((h) => ({ role: h.role === 'driver' ? 'user' : 'assistant', content: h.text })),
            language: this.language,
            road_context: this.deps.roadContext(),
          })
          .then((r) => (r.source !== 'scripted' ? r.reply : null)),
        new Promise<string | null>((res) => this.later(() => res(null), 1500)),
      ])
      if (ai) return { text: ai, source: 'ai' }
    }
    return { text: scripted, source: 'scripted' }
  }

  // @ts-ignore
  private issuePrompt(q: string, source: QuestionSource) {
    this.questionSource = source
    this.question = q
    this.transcript = ''
    this.lastLatency = null
    this.elapsed = 0
    // The response-latency clock starts only once Sarvam has FINISHED
    // speaking — TTS synthesis + playback time must never count against the
    // driver. Until then the timer is 0 (no timeout can fire early either).
    this.questionStartRef = 0
    this.promptIdRef = Math.random().toString(36).slice(2, 10)
    this.setPhase('waiting')
    this.pushTurn('routiq', q)
    this.deps
      .emitEvent({ event_type: 'prompt_issued', transcript: q, prompt_id: this.promptIdRef })
      .catch(() => {})
    this.speakText(q, {
      rate: 1.02,
      onComplete: () => {
        if (!this.deps.isActive()) return
        // The voice finished — the driver's response window starts now.
        this.questionStartRef = performance.now()
        if (this.phase === 'waiting') this.startWaitingTimer()
      },
    })
    // Safety net: if TTS somehow never completes (synthesis hangs AND browser
    // speech fails), the response clock must still start — never wedge the
    // session in a perpetual "waiting" state. Only fires when we are NOT
    // speaking, so a long utterance can never have its clock started early.
    this.later(() => {
      if (!this.questionStartRef && !this.speaking && this.phase === 'waiting') {
        this.questionStartRef = performance.now()
        this.startWaitingTimer()
      }
    }, 8000)
    if (isMusicOffer(q)) {
      this.musicConsent = 'pending'
      this.deps.emitEvent({ event_type: 'music_permission_requested' }).catch(() => {})
    }
    this.emit()
    this.startWaitingTimer()
  }

  private startWaitingTimer() {
    if (this.waitingInterval != null) window.clearInterval(this.waitingInterval)
    this.waitingInterval = window.setInterval(() => {
      // questionStartRef is 0 until TTS finishes — show 0 and never time out
      // early while the question is still being spoken.
      const e = this.questionStartRef ? (performance.now() - this.questionStartRef) / 1000 : 0
      this.elapsed = e
      this.emit()
      if (e >= this.deps.thresholds().max_wait_seconds && this.phase === 'waiting') {
        if (this.waitingInterval) window.clearInterval(this.waitingInterval)
        this.waitingInterval = null
        this.handleTimeout()
      }
    }, 100)
  }

  /**
   * Proactive check-in path (live mode). Quiet monitoring is the default:
   * a prompt is only issued when the risk-adaptive cooldown has elapsed AND
   * the audio path is healthy AND no turn is in flight. If none of those
   * hold, staying silent IS the correct action.
   */
  /**
   * Proactive check-in path (live mode). The FIRST check-in after start /
   * resume / recover always speaks — the conversation opens with Sarvam's
   * voice regardless of mic state (a blocked mic must not silence the
   * greeting; the fail-safe only applies to interpreting non-response).
   * The scheduler gates REPEATED prompts on a healthy audio path so we
   * never nag a driver whose mic is down.
   */
  private async askQuestion() {
    if (!this.deps.isActive() || this.deps.mode() === 'demo') return
    if (this.musicConsent === 'pending') return
    if (this.phase === 'waiting' || this.phase === 'analyzing' || this.phase === 'starting') return
    // Never prompt before the cooldown is up — long quiet periods are by design.
    if (this.nextPromptAt != null && Date.now() < this.nextPromptAt) return
    const { text, source } = await this.pickQuestion()
    if (!this.deps.isActive()) return
    this.issuePrompt(text, source)
  }

  /**
   * Every 2s, from QUIET_MONITORING, check whether a proactive check-in is
   * due (risk-adaptive interval). This is what makes live mode a closed loop:
   * respond -> quiet -> long interval -> gentle check-in -> respond.
   */
  private startCheckInScheduler() {
    if (this.checkInInterval != null) return
    this.checkInInterval = window.setInterval(() => {
      if (!this.deps.isActive() || this.deps.mode() !== 'live') return
      if (this.phase !== 'quiet') return
      if (this.musicConsent === 'pending') return
      if (this.nextPromptAt == null || Date.now() < this.nextPromptAt) return
      if (!this.deps.getDriver().audio_healthy) return
      void this.askQuestion()
    }, 2000)
  }

  // ------------------------------------------------------------- alert
  private enterAlert() {
    if (!this.deps.isActive()) return
    const t = this.deps.transport()
    t?.stopListening()
    t?.stopSpeaking()
    this.clearTimers()
    this.clearDemoTimers()
    this.setPhase('alert')
    t?.alert()
    this.speakText(CRITICAL_MESSAGE)
  }

  // ------------------------------------------------------------- respond
  /**
   * A driver utterance arrived. If we asked a question this is the response
   * (latency measured prompt -> speech start). If we were quiet, it is a
   * DRIVER-INITIATED turn — a first-class path, handled via the chat API.
   */
  private onDriverSpeech(text: string, confidence?: number, latencySecondsOverride?: number) {
    if (!this.deps.isActive() || this.phase === 'analyzing' || this.handlingTurn) return
    this.handlingTurn = true
    const t = this.deps.transport()
    t?.stopListening()
    this.clearTimers()

    const latency =
      latencySecondsOverride ??
      (this.questionStartRef ? Math.max(0.1, (performance.now() - this.questionStartRef) / 1000) : 0.1)

    // ── driver initiated while we were quiet ──────────────────────────────
    if (this.phase !== 'waiting') {
      this.handlingTurn = false // let handleDriverInitiated take ownership
      void this.handleDriverInitiated(text)
      return
    }

    // ── response to our prompt ────────────────────────────────────────────
    const safeLatency = Math.round(latency * 10) / 10
    const band = latencyBand(safeLatency, this.deps.thresholds())
    this.lastLatency = {
      latency: safeLatency,
      band: band.band,
      color: band.color,
      label: band.label,
      transcript: text || '(no audio transcript)',
    }
    this.setPhase('analyzing')
    this.pushTurn('driver', text || '(response)')

    const durationMs = Math.max(0, performance.now() - (this.questionStartRef + safeLatency * 1000))
    const words = text ? text.trim().split(/\s+/).filter(Boolean).length : 0
    const wpm = durationMs > 800 && words > 2 ? words / (durationMs / 60000) : undefined

    this.deps
      .emitEvent({
        event_type: 'response_received',
        latency_ms: safeLatency * 1000,
        response_duration_ms: durationMs > 0 ? durationMs : undefined,
        speech_confidence: confidence,
        speech_rate_wpm: wpm,
        transcript: text,
        prompt_id: this.promptIdRef,
        simulated: !text,
      })
      .then((d) => {
        if (!this.deps.isActive()) return
        this.handlingTurn = false
        // Risk-adaptive pacing: healthy responses earn a long quiet period;
        // degraded states shorten it. Never conflated with response latency.
        this.nextPromptAt = Date.now() + promptIntervalFor(d.state, this.deps.thresholds()) * 1000
        this.deps.applyDriver(d)

        // music consent: only an explicit YES starts music
        const wasMusicOffer = this.musicConsent === 'pending'
        if (wasMusicOffer) {
          const intent = classifyMusicIntent(text || '')
          if (intent === 'yes') {
            this.musicConsent = 'accepted'
            this.deps.emitEvent({ event_type: 'music_permission_granted' }).catch(() => {})
            this.deps.emitEvent({ event_type: 'music_started' }).catch(() => {})
            this.deps.transport()?.playMusic()
            this.deps.transport()?.setMusicVolume(0.05)
          } else {
            this.musicConsent = 'declined'
            this.deps.emitEvent({ event_type: 'music_permission_denied' }).catch(() => {})
          }
        }
        this.emit()

        if (d.state === 'HIGH_CONCERN') {
          this.later(() => this.enterAlert(), 900)
          return
        }
        // The passenger responds to the reply, then goes quiet. Music
        // consent replies need no spoken ack (the music itself is the reply).
        if (!wasMusicOffer) {
          const ack = scriptedReply(d.state, this.ackSeed++)
          if (ack) {
            this.pushTurn('routiq', ack)
            this.speakText(ack)
          }
        }
        // healthy reply -> acknowledge -> quiet monitoring (scheduler owns pacing)
        this.setPhase('quiet')
      })
  }

  // --------------------------------------------- driver-initiated turns
  private async handleDriverInitiated(text: string) {
    if (!text || !text.trim() || this.handlingTurn) return
    this.handlingTurn = true
    try {
      await this.driverInitiatedFlow(text.trim())
    } finally {
      this.handlingTurn = false
    }
  }

  /**
   * Groq answers driver-initiated turns; deterministic policy gates actions.
   *
   * IMPORTANT: every branch of this method must end in one of:
   *   - a call to speakText(..., { onComplete: returnToListening }), which
   *     puts the manager back into 'quiet' (and re-arms the mic) once Routiq
   *     actually finishes speaking, or
   *   - a hand-off to another explicit state transition (issuePrompt ->
   *     'waiting' for the music offer, onEmergency() for emergencies).
   * Leaving `phase` sitting at 'analyzing' with no path out is what caused
   * the microphone to appear "dead" after a driver-initiated turn: every
   * later transcript was silently dropped by the `phase === 'analyzing'`
   * guard in onDriverSpeech(), even though the mic itself was still live.
   */
  private async driverInitiatedFlow(transcript: string) {
    this.setPhase('analyzing')
    this.lastLatency = null
    this.transcript = transcript

    // client-side intent (fast) + language switch detection
    let intent = classifyIntentClient(transcript)
    const langTarget = targetLanguage(transcript)
    this.lastIntent = intent
    if (langTarget) intent = 'LANGUAGE_SWITCH'
    this.pushTurn('driver', transcript, intent)
    this.emit()

    this.deps
      .emitEvent({ event_type: 'driver_initiated', transcript, language: this.language })
      .catch(() => {})
    this.deps.emitEvent({ event_type: 'intent_detected', intent, transcript, language: this.language }).catch(() => {})

    const returnToListening = () => {
      if (!this.deps.isActive()) return
      // setPhase('quiet') also calls transport().ask() in live mode, which
      // is what actually re-arms the microphone for the next turn.
      this.setPhase('quiet')
    }

    try {
      const res = await api.fatigueChat({
        intent: 'driver_initiated',
        session_id: this.deps.sessionId() || undefined,
        messages: this.history.map((h) => ({ role: h.role === 'driver' ? 'user' : 'assistant', content: h.text })),
        driver_text: transcript,
        language: this.language,
        road_context: this.deps.roadContext(),
      })
      if (!this.deps.isActive()) return

      // natural language switching — backend tells us the new language
      if (res.language && res.language !== this.language) {
        this.setLanguage(res.language)
        this.deps.emitEvent({ event_type: 'language_changed', language: res.language, transcript }).catch(() => {})
      }
      this.lastIntent = res.intent || intent
      this.lastAction = res.action ?? null
      this.questionSource = res.source === 'scripted' ? 'scripted' : 'ai'
      this.emit()

      // policy layer — the LLM proposes, the app decides
      const action = res.action?.type
      if (action === 'music_request') {
        // never auto-play: ask permission. offerMusic() -> issuePrompt()
        // owns the next transition ('waiting'), so we do NOT also call
        // returnToListening here.
        this.later(() => this.offerMusic(), 500)
        return
      }
      if (action === 'emergency') {
        // onEmergency() owns whatever comes next for this session.
        this.deps.onEmergency()
        return
      }
      const reply = res.reply || scriptedForIntent(res.intent, 'I’m here.')
      this.pushTurn('routiq', reply)
      this.emit()
      this.speakText(reply, { onComplete: returnToListening })
    } catch {
      if (!this.deps.isActive()) return
      const reply = scriptedForIntent(intent, "I'm here. Ask me about the road ahead whenever you need.")
      this.pushTurn('routiq', reply)
      this.emit()
      this.speakText(reply, { onComplete: returnToListening })
    }
  }

  // ------------------------------------------------------------- timeout
  private handleTimeout() {
    if (!this.deps.isActive() || this.phase === 'analyzing') return
    this.deps.transport()?.stopListening()
    this.clearTimers()
    this.setPhase('analyzing')
    this.lastLatency = {
      latency: this.deps.thresholds().max_wait_seconds,
      band: 'SEVERE',
      color: '#ef4444',
      label: 'No response',
      transcript: '(no speech detected)',
    }
    this.deps
      .emitEvent({ event_type: 'silence_timeout', prompt_id: this.promptIdRef, simulated: true })
      .then((d) => {
        if (!this.deps.isActive()) return
        this.nextPromptAt = Date.now() + promptIntervalFor(d.state, this.deps.thresholds()) * 1000
        this.deps.applyDriver(d)

        if (this.musicConsent === 'pending') {
          // silence on a music offer means NO music
          this.musicConsent = 'declined'
          this.deps.emitEvent({ event_type: 'music_permission_denied' }).catch(() => {})
        }
        this.emit()

        const continueAfterNudge = () => {
          if (!this.deps.isActive()) return
          if (d.state === 'HIGH_CONCERN') {
            this.later(() => this.enterAlert(), 900)
            return
          }
          // back to quiet monitoring — the risk-adaptive scheduler owns pacing
          this.setPhase('quiet')
        }

        if (this.ttsEnabled && d.audio_healthy) {
          const nudge =
            d.state === 'ELEVATED'
              ? "You've been quiet. Hey, are you still with me?"
              : d.state === 'ATTENTION'
                ? 'You okay out there?'
                : null
          if (nudge) {
            this.speakText(nudge, { onComplete: continueAfterNudge })
            return
          }
        }
        continueAfterNudge()
      })
  }

  // --------------------------------------------------------------- demo
  private demoTurn(step: DemoStep) {
    if (!this.deps.isActive() || this.deps.mode() !== 'demo') return

    // ── driver-initiated step: the driver speaks first ────────────────────
    if (step.kind === 'driver' && step.transcript) {
      this.setPhase('analyzing')
      this.deps.emitEvent({ event_type: 'driver_initiated', transcript: step.transcript, simulated: true }).catch(() => {})
      const intent = step.intent || classifyIntentClient(step.transcript)
      this.lastIntent = intent
      this.pushTurn('driver', step.transcript, intent)
      const reply = step.reply || scriptedForIntent(intent, "I'm here.")
      this.pushTurn('routiq', reply)
      this.emit()
      this.speakText(reply)
      return
    }

    const q = step.kind === 'silence' ? DEMO_SILENCE_PROMPT : step.prompt ?? this.deps.scriptedNextPrompt()
    this.issuePrompt(q, 'scripted')
    if (step.kind === 'response') {
      const latencySec = (step.latency_ms ?? 1500) / 1000
      this.demoLater(
        () => this.onDriverSpeech(step.transcript || 'Yeah.', 0.9, latencySec),
        (step.latency_ms ?? 1500) + 250,
      )
    }
    // silence steps: the elapsed-timer interval fires the timeout at max_wait
  }

  private startDemo() {
    if (!this.deps.isActive() || this.deps.mode() !== 'demo') return
    const startAt = this.deps.sessionStart() ?? performance.now()
    DEMO_SCRIPT.forEach((step) => {
      this.demoLater(() => {
        this.demoTurn(step)
      }, Math.max(0, startAt + step.at * 1000 - performance.now()))
    })
  }

  // ----------------------------------------------------------- lifecycle
  start(mode: 'live' | 'demo') {
    if (this.deps.isActive()) return
    this.deps.setMode(mode)
    this.deps.setActive(true)
    this.deps.setSessionStart(performance.now())
    this.nextPromptAt = Date.now()
    this.deps.transport()?.start()
    this.musicConsent = 'idle'
    this.history = []
    this.turnCount = 0
    this.lastLatency = null
    this.setPhase('starting')
    this.startCooldownLoop()
    this.startCheckInScheduler()

    if (this.aiEnabled && this.aiAvailable === null) {
      api
        .fatigueChat({ intent: 'question', messages: [] })
        .then((r) => {
          this.aiAvailable = r.source !== 'scripted'
          this.emit()
        })
        .catch(() => {
          this.aiAvailable = false
          this.emit()
        })
    }

    // create the backend session (the local engine shadow is already fresh)
    api
      .createFatigueSession({
        mode,
        thresholds: this.deps.thresholds() as unknown as Record<string, number>,
        language: this.language === 'auto' ? 'en-IN' : this.language,
      })
      .then((s) => {
        this.deps.setSessionId(s.session_id)
        this.deps.applyDriver(s)
      })
      .catch(() => {
        /* offline — the local shadow keeps the session fully functional */
      })

    this.later(() => {
      if (!this.deps.isActive()) return
      this.speakText(INTRO)
      this.later(() => {
        if (!this.deps.isActive()) return
        this.setPhase('intro')
        if (mode === 'demo') this.startDemo()
        else this.askQuestion()
      }, 800)
    }, 500)
  }

  private startCooldownLoop() {
    if (this.cooldownInterval != null) window.clearInterval(this.cooldownInterval)
    this.cooldownInterval = window.setInterval(() => {
      this.emit()
    }, 250)
  }

  stop() {
    this.deps.setActive(false)
    this.deps.transport()?.stopListening()
    this.deps.transport()?.stopSpeaking()
    this.deps.transport()?.stop()
    this.clearTimers()
    this.clearDemoTimers()
    this.disarmBargeIn()
    this.currentTtsText = ''
    this.setPhase('idle')
    this.deps.setSessionId('')
    this.deps.setSessionStart(null)
    this.nextPromptAt = null
    this.musicConsent = 'idle'
    this.history = []
    this.lastLatency = null
  }

  pause() {
    this.deps.setActive(false)
    this.deps.transport()?.stopListening()
    this.deps.transport()?.stopSpeaking()
    this.clearTimers()
    this.clearDemoTimers()
    this.disarmBargeIn()
    this.currentTtsText = ''
    this.setPhase('paused')
  }

  resume() {
    if (this.deps.isActive()) return
    this.deps.setActive(true)
    if (this.deps.mode() === 'demo') {
      this.deps.setSessionStart(performance.now())
      this.nextPromptAt = Date.now()
      this.deps.emitEvent({ event_type: 'reset' }).catch(() => {})
      this.setPhase('intro')
      this.startDemo()
      return
    }
    this.deps.transport()?.start()
    this.setPhase('quiet')
    this.startCheckInScheduler()
    this.askQuestion()
  }

  recover() {
    this.deps.setActive(true)
    this.deps.emitEvent({ event_type: 'reset' }).catch(() => {})
    this.nextPromptAt = Date.now() + 2000
    this.lastLatency = null
    this.musicConsent = 'idle'
    this.setPhase('intro')
    this.startCheckInScheduler()
    if (this.deps.mode() === 'demo') {
      this.deps.setSessionStart(performance.now())
      this.later(() => this.startDemo(), 1000)
    } else {
      this.later(() => this.askQuestion(), 1000)
    }
  }

  // ------------------------------------------------------------ controls
  offerMusic() {
    if (!this.deps.isActive()) return
    if (this.musicConsent === 'pending' || this.musicConsent === 'accepted') return
    if (this.phase === 'waiting' || this.phase === 'starting') return
    this.clearTimers()
    this.musicConsent = 'pending'
    this.issuePrompt(MUSIC_OFFER, 'scripted')
  }

  stopMusic() {
    this.deps.transport()?.stopMusic()
    this.deps.emitEvent({ event_type: 'music_stopped' }).catch(() => {})
    this.musicConsent = 'idle'
    this.emit()
  }

  setLanguage(code: string) {
    this.language = code
    try {
      localStorage.setItem('roadsafe.language', code)
    } catch {
      /* noop */
    }
    this.emit()
  }

  setTts(on: boolean) {
    this.ttsEnabled = on
    if (!on) this.deps.transport()?.stopSpeaking()
  }

  setAi(on: boolean) {
    this.aiEnabled = on
    try {
      localStorage.setItem('roadsafe.ai', on ? 'on' : 'off')
    } catch {
      /* noop */
    }
  }

  setMusicVolume(v: number) {
    this.deps.transport()?.setMusicVolume(v)
  }

  /** Simulate a driver reply to the current prompt (demo / mic-blocked). */
  demoReply(text?: string) {
    if (!this.deps.isActive()) return
    this.onDriverSpeech(text || 'I am here, all good.', 0.9)
  }

  simulateDelayedReply(text: string, delayMs: number) {
    if (this.phase !== 'waiting') return
    this.later(() => this.demoReply(text), delayMs)
  }

  forceTimeout() {
    if (this.phase === 'waiting') this.handleTimeout()
  }

  /** Push-to-talk: explicitly start a driver-initiated turn. */
  pushToTalk() {
    if (!this.deps.isActive() || this.phase === 'waiting') return
    this.deps.transport()?.ask()
  }

  getConversationState(): ManagerState['conversationState'] {
    return this.conversationState()
  }

  sessionSeconds(): number | undefined {
    const start = this.deps.sessionStart()
    if (start == null) return undefined
    return (performance.now() - start) / 1000
  }

  /** Dev diagnostics: total conversation turns (driver + routiq) pushed
   *  into history this session. Pairs with `phase` to answer "why did the
   *  Nth turn die" without reading code. */
  getTurnCount(): number {
    return this.turnCount
  }

  /** Dev diagnostics: raw internal phase, distinct from the user-facing
   *  conversationState() label — this is what onDriverSpeech()'s guard
   *  actually checks, so it is the single most useful diagnostic value. */
  getPhase(): SleepPhase {
    return this.phase
  }

  // ------------------------------------------------------ transport feed
  onTransportStatus(s: { listening: boolean; micBlocked: boolean }) {
    this.emit()
    return s
  }

  onSpeechEvent(e: {
    kind: string
    finalText?: string
    interimText?: string
    confidence?: number
    error?: string
  }) {
    if (e.kind === 'speechstart') {
      if (this.speaking) {
        // The assistant's own voice echoes back through the mic and fires
        // speechstart — never cut TTS on that. Arm a candidate; only a
        // FINAL result that is not the echo confirms a real barge-in.
        this.armBargeIn()
      } else if (this.deps.isActive()) {
        // genuine driver speech while we were quiet — start the response
        // timing window
        this.deps.emitEvent({ event_type: 'speech_started' }).catch(() => {})
      }
    } else if (e.kind === 'result' && e.finalText && e.finalText.trim()) {
      const text = e.finalText.trim()
      if (this.speaking && this.bargeCandidate) {
        this.disarmBargeIn()
        if (isTtsEcho(text, this.currentTtsText)) {
          // our own voice — ignore, keep speaking
          return
        }
        // real driver speech: interrupt TTS, then treat as driver-initiated
        this.bargeIn()
        this.onDriverSpeech(text, e.confidence)
        return
      }
      // The assistant's voice echoes back through the mic even AFTER it
      // finished speaking — a transcribed echo must never become a fake
      // driver turn (that was the "heard twice" bug). Filter it for a short
      // window after the last TTS utterance.
      const echoWindowMs = 6000
      if (
        this.currentTtsText &&
        (this.speaking || performance.now() - this.lastTtsEndAt < echoWindowMs) &&
        isTtsEcho(text, this.currentTtsText)
      ) {
        return
      }
      this.onDriverSpeech(text, e.confidence)
    }
  }
}