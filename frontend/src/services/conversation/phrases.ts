/**
 * Conversational phrases + client-side decision helpers for Sleep Drive.
 *
 * MACHINE EXPLANATION and HUMAN CONVERSATION are deliberately separated: the
 * UI shows technical metrics, the spoken assistant uses short warm human
 * phrases. A good passenger never says "your response latency is within
 * normal parameters" — they say "Good to hear."
 */
import type { DriverRiskState } from '../../types'

export const INTRO = 'Sleep Drive is active. I will check in with you from time to time as we drive.'

/** Short acknowledgements after a healthy response. Then: silence. */
const ACK_PHRASES = [
  'Good to hear.',
  'Alright.',
  'Sounds good.',
  'Got you.',
  "Okay, take it easy.",
]

const ATTENTION_REPLIES = [
  'You seem a little quiet — everything alright up there?',
  'Hey, you doing okay? Just checking in.',
]

const ELEVATED_REPLIES = [
  'A couple of those replies were slow. Hey, you still with me?',
  "You've been a little quiet. Want me to help you find a place to stop?",
]

/** The one prompt that requests music. Consent is ALWAYS required. */
export const MUSIC_OFFER = 'Want me to play some music?'

/**
 * Scripted conversational reply after a driver response, by state.
 * Returns null when the assistant should stay silent.
 */
export function scriptedReply(state: DriverRiskState, seed: number): string | null {
  if (state === 'NORMAL') return ACK_PHRASES[seed % ACK_PHRASES.length]
  if (state === 'ATTENTION') return ATTENTION_REPLIES[seed % ATTENTION_REPLIES.length]
  if (state === 'ELEVATED') return ELEVATED_REPLIES[seed % ELEVATED_REPLIES.length]
  return null // HIGH_CONCERN escalates via the critical message instead
}

/** Is this prompt asking the driver for permission to play music? */
export function isMusicOffer(text: string): boolean {
  const t = text.toLowerCase()
  return /play (some |any )?music|play something|want (me to play|some music)|a song/.test(t)
}

export type MusicIntent = 'yes' | 'no' | 'maybe'

/**
 * Classify a driver's reply to the music offer. Consent is never assumed:
 * only a clearly positive answer starts music; anything ambiguous is treated
 * as NO.
 */
export function classifyMusicIntent(text: string): MusicIntent {
  // Normalize curly apostrophes/quotes — ASR may produce either form.
  const t = (text || '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[.,!?]+$/, '')
  if (!t) return 'maybe'
  if (/^(no|nope|nah|not now|no thanks|no thank you|don'?t|stop|never ?mind|skip|pass|cancel|i'?m ?(good|fine|okay|ok)|i don'?t (want|need)|not really|maybe later|later)/.test(t)) {
    return 'no'
  }
  if (/^(yes|yeah|yep|yup|sure|okay|ok|alright|fine|please|go ahead|play it|play something|music|do it|good idea|sounds good|why not)/.test(t)) {
    return 'yes'
  }
  return 'maybe'
}

/** Scripted fallback reply for a classified driver intent (backend mirrors
 *  this in main.py `_scripted_for`). */
export function scriptedForIntent(intent: string, fallbackPrompt: string): string {
  switch (intent) {
    case 'PROACTIVE_CHECKIN':
      return fallbackPrompt
    case 'EMERGENCY':
      return "Okay, I'm getting you help. Stay with me."
    case 'FATIGUE_DISCLOSURE':
      return "Your responses have slowed. If you're feeling tired, I'd strongly recommend finding a safe place to stop for a break."
    case 'ROUTE_REQUEST':
      return 'Sure — I’m checking safer alternatives now.'
    case 'SAFETY_QUERY':
      return 'Let me check the road ahead and the risk along your route.'
    case 'MUSIC_REQUEST':
      return 'Happy to play something. Want me to put on some music?'
    case 'LANGUAGE_SWITCH':
      return "Sure — I'll switch."
    case 'RESPONSE':
      return 'Good to hear. I’ll keep an eye on things.'
    default:
      return "I'm here. Ask me about the road ahead, a safer route, or take a break whenever you need."
  }
}

/** Client-side intent mirror of backend app/services/intent.py — used for
 *  offline prompt/action decisions. Safety-critical intents always win. */
export function classifyIntentClient(text: string): string {
  const t = (text || '').trim().toLowerCase()
  if (!t) return 'GENERAL_CONVERSATION'
  if (/\b(crashe?d?|accident|help|emergency|ambulance|bleeding|blood|urgent|help karo|madad karo)\b/.test(t)) {
    return 'EMERGENCY'
  }
  if (/\b(tired|sleepy|drowsy|exhausted|fatigued|neend|thak|ni?nd|surukku)\b/.test(t) || /\b(falling|falling)\b.*\b(asleep|sleep)\b/.test(t) || /\bcan'?t (keep|hold) (my )?eyes open\b/.test(t)) {
    return 'FATIGUE_DISCLOSURE'
  }
  if (/\b(safer|alternative|different|another|better)\b.*\broute\b/.test(t) || /\breroute\b/.test(t) || /\b(doosra|dusra)\b.*\b(rasta|road)\b/.test(t)) {
    return 'ROUTE_REQUEST'
  }
  if (/\b(safe|risky|dangerous|hazard|risk)\b.*\b(road|route|ahead|here|segment|stretch)\b/.test(t) || /\bsafety score\b/.test(t) || /\bkhatra\b/.test(t)) {
    return 'SAFETY_QUERY'
  }
  if (/\bplay\b.*\b(music|song|songs|something|audio)\b/.test(t) || /\b(music|song)\b.*\b(play|please|chalao|bajao)\b/.test(t) || /\bsome music\b/.test(t)) {
    return 'MUSIC_REQUEST'
  }
  if (/\bswitch\b.*\b(?:to|language)\b/.test(t) || /\bspeak\b.*\b(hindi|tamil|telugu|kannada|malayalam|marathi|bengali|gujarati|punjabi|odia|english)\b/.test(t) || /\b(hindi|tamil|telugu|kannada|malayalam|marathi|bengali|gujarati|punjabi|odia|english)\b.*\b(mein|me|la|il|le|please)\b/.test(t)) {
    return 'LANGUAGE_SWITCH'
  }
  return 'GENERAL_CONVERSATION'
}

/** BCP-47 target when the utterance is a language switch. */
const LANGUAGE_ALIASES: Record<string, string> = {
  english: 'en-IN',
  hindi: 'hi-IN',
  tamil: 'ta-IN',
  telugu: 'te-IN',
  kannada: 'kn-IN',
  malayalam: 'ml-IN',
  marathi: 'mr-IN',
  bengali: 'bn-IN',
  gujarati: 'gu-IN',
  punjabi: 'pa-IN',
  odia: 'od-IN',
}

export function targetLanguage(text: string): string | null {
  const t = (text || '').toLowerCase()
  for (const [alias, code] of Object.entries(LANGUAGE_ALIASES)) {
    if (
      new RegExp(`\\b(switch|speak|talk|bolo|batao|baat)\\b.*\\b${alias}\\b`).test(t) ||
      new RegExp(`\\b${alias}\\b.*\\b(mein|me|la|il|le|please)\\b`).test(t)
    ) {
      return code
    }
  }
  return null
}
