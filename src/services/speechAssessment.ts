export interface AssessmentResult {
  transcript: string
  passed: boolean
  score: number // 0-100
}

export interface SpeechAssessmentService {
  isSupported(): boolean
  // target can be a single word or a whole sentence
  assess(target: string, lang?: string): Promise<AssessmentResult>
  cancel(): void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecognitionClass = new () => any

function getRecognitionClass(): RecognitionClass | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  if ('SpeechRecognition' in window) return w.SpeechRecognition as RecognitionClass
  if ('webkitSpeechRecognition' in window) return w.webkitSpeechRecognition as RecognitionClass
  return null
}

// Case, punctuation and extra spaces don't count against pronunciation —
// "I like it." must match a recognizer transcript of "i like it"
function normalizeSpeech(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function similarity(a: string, b: string): number {
  const s = normalizeSpeech(a)
  const t = normalizeSpeech(b)
  if (s === t) return 100
  // Levenshtein-based similarity
  const dp = Array.from({ length: s.length + 1 }, (_, i) =>
    Array.from({ length: t.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      dp[i][j] =
        s[i - 1] === t[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  const dist = dp[s.length][t.length]
  const maxLen = Math.max(s.length, t.length)
  return Math.round((1 - dist / maxLen) * 100)
}

// Give up listening after this long: stop() first so a late result can still
// arrive, then force an empty result shortly after
export const LISTEN_TIMEOUT_MS = 15000
const STOP_GRACE_MS = 2000

class WebSpeechAssessment implements SpeechAssessmentService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null

  isSupported(): boolean {
    return getRecognitionClass() !== null
  }

  assess(target: string, lang = 'en-GB'): Promise<AssessmentResult> {
    return new Promise((resolve, reject) => {
      const RC = getRecognitionClass()
      if (!RC) {
        reject(new Error('SpeechRecognition not supported'))
        return
      }
      const rec = new RC()
      this.recognition = rec
      rec.lang = lang
      rec.interimResults = false
      rec.maxAlternatives = 3

      const empty: AssessmentResult = { transcript: '', score: 0, passed: false }
      let settled = false
      let graceTimer: ReturnType<typeof setTimeout> | undefined
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(stopTimer)
        clearTimeout(graceTimer)
        fn()
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (event: any) => {
        let best = ''
        let bestScore = 0
        for (let i = 0; i < event.results[0].length; i++) {
          const t = event.results[0][i].transcript
          const s = similarity(target, t)
          if (s > bestScore) { bestScore = s; best = t }
        }
        settle(() => resolve({ transcript: best, score: bestScore, passed: bestScore >= 70 }))
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (e: any) => {
        if (e.error === 'no-speech') {
          settle(() => resolve(empty))
        } else {
          settle(() => reject(new Error(e.error)))
        }
      }

      rec.onnomatch = () => settle(() => resolve(empty))

      // Some engines (iOS Safari especially) end recognition without ever
      // firing onresult/onerror — without this the UI hangs on "listening"
      rec.onend = () => settle(() => resolve(empty))

      // Engine never ends on its own: stop it, then force an empty result
      const stopTimer = setTimeout(() => {
        graceTimer = setTimeout(() => settle(() => resolve(empty)), STOP_GRACE_MS)
        try {
          rec.stop()
        } catch {
          settle(() => resolve(empty))
        }
      }, LISTEN_TIMEOUT_MS)

      rec.start()
    })
  }

  cancel(): void {
    this.recognition?.abort()
    this.recognition = null
  }
}

export const speechAssessment: SpeechAssessmentService = new WebSpeechAssessment()
