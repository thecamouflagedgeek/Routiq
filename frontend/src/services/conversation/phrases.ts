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

// ---------------------------------------------------------------------------
// Language selection onboarding — the opening step of every Sleep Drive
// session. Routiq asks which language the driver wants FIRST, and only then
// begins the real conversation in that language.
// ---------------------------------------------------------------------------

/** "Which language would you like me to speak in?" — in each supported
 *  language, so a returning Hindi-speaking driver hears the ask in Hindi. */
const LANG_ASK: Record<string, string> = {
  'en-IN': 'First, which language would you like me to speak in?',
  'hi-IN': 'पहले बताइए, आप किस भाषा में बात करना चाहेंगे?',
  'ta-IN': 'முதலில், நீங்கள் எந்த மொழியில் பேச விரும்புகிறீர்கள்?',
  'te-IN': 'మొదట, మీరు ఏ భాషలో మాట్లాడాలనుకుంటున్నారు?',
  'kn-IN': 'ಮೊದಲು, ನೀವು ಯಾವ ಭಾಷೆಯಲ್ಲಿ ಮಾತನಾಡಲು ಬಯಸುತ್ತೀರಿ?',
  'ml-IN': 'ആദ്യം, ഏത് ഭാഷയിൽ സംസാരിക്കണമെന്ന് നിങ്ങൾ ആഗ്രഹിക്കുന്നു?',
  'mr-IN': 'आधी सांगा, तुम्हाला कोणत्या भाषेत बोलायला आवडेल?',
  'bn-IN': 'প্রথমে বলুন, আপনি কোন ভাষায় কথা বলতে চান?',
  'gu-IN': 'પહેલા કહો, તમે કઈ ભાષામાં વાત કરવા માંગો છો?',
  'pa-IN': 'ਪਹਿਲਾਂ ਦੱਸੋ, ਤੁਸੀਂ ਕਿਹੜੀ ਭਾਸ਼ਾ ਵਿੱਚ ਗੱਲ ਕਰਨੀ ਚਾਹੁੰਦੇ ਹੋ?',
  'od-IN': 'ପ୍ରଥମେ କୁହନ୍ତୁ, ଆପଣ କେଉଁ ଭାଷାରେ କଥା ହେବାକୁ ଚାହାଁନ୍ତି?',
}

/** The options list (English names — detection also understands the native
 *  script, e.g. "हिंदी" or "தமிழ்", so drivers can answer their own way). */
const LANG_OPTIONS =
  'You can say English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, or Odia.'

/** The full spoken/displayed language-selection question. */
export function languagePrompt(current: string): string {
  return `${LANG_ASK[current] ?? LANG_ASK['en-IN']} ${LANG_OPTIONS}`
}

/** Confirmation spoken in the NEWLY chosen language. */
const LANG_CONFIRM: Record<string, string> = {
  'en-IN': "Great. I'll speak English for this drive.",
  'hi-IN': 'बहुत बढ़िया। मैं इस ड्राइव में हिंदी बोलूँगा।',
  'ta-IN': 'அருமை. இந்த ஓட்டத்தில் நான் தமிழில் பேசுவேன்.',
  'te-IN': 'బాగుంది. ఈ ప్రయాణంలో నేను తెలుగులో మాట్లాడతాను.',
  'kn-IN': 'ಅದ್ಭುತ. ಈ ಪ್ರಯಾಣದಲ್ಲಿ ನಾನು ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡುತ್ತೇನೆ.',
  'ml-IN': 'കൊള്ളാം. ഈ യാത്രയിൽ ഞാൻ മലയാളത്തിൽ സംസാരിക്കും.',
  'mr-IN': 'छान. या ड्राइवमध्ये मी मराठीत बोलेन.',
  'bn-IN': 'চমৎকার। এই ড্রাইভে আমি বাংলায় কথা বলব।',
  'gu-IN': 'સરસ. આ ડ્રાઇવમાં હું ગુજરાતીમાં વાત કરીશ.',
  'pa-IN': 'ਵਧੀਆ. ਇਸ ਡਰਾਈਵ ਵਿੱਚ ਮੈਂ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰਾਂਗਾ।',
  'od-IN': 'ବଢ଼ିଆ. ଏହି ଡ୍ରାଇଭରେ ମୁଁ ଓଡ଼ିଆରେ କଥା ହେବି।',
}

export function languageConfirm(code: string): string {
  return LANG_CONFIRM[code] ?? LANG_CONFIRM['en-IN']
}

/** "Sleep Drive is active…" — localized so a driver who chose Hindi/Tamil/…
 *  hears the greeting in their own language. */
const INTRO_BY_LANG: Record<string, string> = {
  'en-IN': INTRO,
  'hi-IN': 'स्लीप ड्राइव शुरू हो गया है। ड्राइव के दौरान मैं आपसे बीच-बीच में बात करती रहूँगी।',
  'ta-IN': 'ஸ்லீப் டிரைவ் செயல்படுகிறது. ஓட்டும்போது நான் அவ்வப்போது உங்களிடம் பேசுவேன்.',
  'te-IN': 'స్లీప్ డ్రైవ్ యాక్టివ్ అయింది. ప్రయాణంలో నేను మిమ్మల్ని అప్పుడప్పుడు అడుగుతుంటాను.',
  'kn-IN': 'ಸ್ಲೀಪ್ ಡ್ರೈವ್ ಆನ್ ಆಗಿದೆ. ಚಾಲನೆ ಮಾಡುವಾಗ ನಾನು ಆಗಾಗ ನಿಮ್ಮೊಂದಿಗೆ ಮಾತನಾಡುತ್ತೇನೆ.',
  'ml-IN': 'സ്ലീപ്പ് ഡ്രൈവ് സജീവമാണ്. യാത്രയ്ക്കിടയിൽ ഞാൻ ഇടയ്ക്കിടെ നിങ്ങളോട് സംസാരിക്കും.',
  'mr-IN': 'स्लीप ड्राइव सुरू झाला आहे. ड्राइव्ह करताना मी तुमच्याशी वेळोवेळी बोलत राहीन.',
  'bn-IN': 'স্লিপ ড্রাইভ সক্রিয়। গাড়ি চালানোর সময় আমি মাঝে মাঝে আপনার সঙ্গে কথা বলব।',
  'gu-IN': 'સ્લીપ ડ્રાઇવ સક્રિય છે. ડ્રાઇવિંગ દરમિયાન હું તમારી સાથે વચ્ચે વચ્ચે વાત કરીશ.',
  'pa-IN': 'ਸਲੀਪ ਡਰਾਈਵ ਚਾਲੂ ਹੈ। ਗੱਡੀ ਚਲਾਉਂਦੇ ਸਮੇਂ ਮੈਂ ਸਮੇਂ-ਸਮੇਂ ਤੇ ਤੁਹਾਡੇ ਨਾਲ ਗੱਲ ਕਰਾਂਗਾ।',
  'od-IN': 'ସ୍ଲିପ ଡ୍ରାଇଭ ସକ୍ରିୟ ଅଛି। ଗାଡି ଚଲାଉଥିବା ସମୟରେ ମୁଁ ବେଳେବେଳେ ଆପଣଙ୍କ ସହ କଥା ହେବି।',
}

export function introFor(code: string): string {
  return INTRO_BY_LANG[code] ?? INTRO
}

/** English name of a language code (used by the deterministic demo reply). */
const LANG_EN_NAMES: Record<string, string> = {
  'en-IN': 'English',
  'hi-IN': 'Hindi',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi',
  'bn-IN': 'Bengali',
  'gu-IN': 'Gujarati',
  'pa-IN': 'Punjabi',
  'od-IN': 'Odia',
}

export function languageEnglishName(code: string): string {
  return LANG_EN_NAMES[code] ?? 'English'
}

/** Recognizable names per language — English names plus native script, so
 *  "Hindi", "हिंदी", "தமிழ்" or "English please" all resolve. */
const LANG_DETECT: Record<string, string[]> = {
  'en-IN': ['english'],
  'hi-IN': ['hindi', 'hindhi', 'हिंदी', 'हिन्दी'],
  'ta-IN': ['tamil', 'தமிழ்'],
  'te-IN': ['telugu', 'తెలుగు'],
  'kn-IN': ['kannada', 'ಕನ್ನಡ'],
  'ml-IN': ['malayalam', 'മലയാളം'],
  'mr-IN': ['marathi', 'मराठी'],
  'bn-IN': ['bengali', 'bangla', 'বাংলা'],
  'gu-IN': ['gujarati', 'ગુજરાતી'],
  'pa-IN': ['punjabi', 'ਪੰਜਾਬੀ'],
  'od-IN': ['odia', 'oriya', 'ଓଡ଼ିଆ'],
}

/** Extract the language a driver named in their reply. Returns the BCP-47
 *  code, or null when no language name is present. */
export function detectLanguage(text: string): string | null {
  const t = (text || '').toLowerCase().trim()
  if (!t) return null
  for (const [code, names] of Object.entries(LANG_DETECT)) {
    for (const name of names) {
      if (t.includes(name)) return code
    }
  }
  return null
}

/** Short acknowledgements after a healthy response. Then: silence.
 *  A large, varied pool — a drive should never hear the same line twice. */
const ACK_PHRASES = [
  'Good to hear.',
  'Alright.',
  'Sounds good.',
  'Got you.',
  "Okay, take it easy.",
  "Nice, I'm with you.",
  "Good stuff.",
  "Understood.",
  "Fair enough.",
  "Alright, noted.",
  "Good to know.",
  "Got it, thanks.",
  "Okay, you're doing fine.",
  "Perfect, keep it steady.",
  "Cool, I'm here if you need me.",
  "Nice and calm up there, good.",
  "Okay, I'll stay quiet and keep watching.",
  "Alright, all good on my end too.",
]

const ATTENTION_REPLIES = [
  'You seem a little quiet — everything alright up there?',
  'Hey, you doing okay? Just checking in.',
  "You've been quiet for a few minutes — all good?",
  'Quick check: still with me?',
]

const ELEVATED_REPLIES = [
  'A couple of those replies were slow. Hey, you still with me?',
  "You've been a little quiet. Want me to help you find a place to stop?",
  'Your replies have slowed — how are you feeling right now?',
  "Let's take stock: are you okay to keep driving, or should we plan a stop?",
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

/**
 * True when a recognized utterance is really the assistant's OWN voice
 * echoing back through the microphone (the TTS coming out of the speakers).
 * Used by the barge-in filter so the assistant never cuts itself off — only
 * speech that does NOT match what is currently being spoken counts as a
 * genuine driver interruption. Works across scripts (Devanagari, Tamil, ...).
 */
export function isTtsEcho(driverText: string, ttsText: string): boolean {
  const norm = (t: string) =>
    (t || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  const driver = norm(driverText)
  const tts = norm(ttsText)
  if (driver.length < 2 || tts.length === 0) return false
  // Verbatim reproduction of a substantial chunk of what we just said.
  // SHORT transcripts are deliberately exempt: a driver answering the
  // language ask with "English" or "Hindi" is a genuine reply even though
  // those words appear inside the prompt (the old containment check ate
  // them whenever the echo window was still armed).
  if (driver.length >= 8 && driver.length >= tts.length * 0.4) {
    if (tts.includes(driver) || driver.includes(tts) || tts.startsWith(driver)) return true
  }
  // Garbled ASR of our own voice: LONG transcripts that mostly reuse the
  // words we just said even when accuracy/word order drifted (the full
  // language ask is ~25 words, so its echo is long and heavily overlapping).
  // Multi-word genuine replies ("I want to speak in Hindi") are never long
  // enough to be judged this way.
  const driverWords = driver.split(/\s+/)
  if (driverWords.length >= 10) {
    const ttsWords = new Set(tts.split(/\s+/))
    const set = new Set(driverWords)
    let overlap = 0
    set.forEach((w) => {
      if (ttsWords.has(w)) overlap += 1
    })
    if (overlap / set.size >= 0.6) return true
  }
  return false
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
