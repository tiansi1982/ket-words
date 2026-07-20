import { useState, useEffect, useRef, useCallback } from 'react'
import { tts } from '@/services/tts'
import { recorder } from '@/services/recorder'
import { startSoeSession, type SoeSession, type SoeResult } from '@/services/soe'
import { baseWord, displayWord } from '@/lib/word-utils'
import ProgressBar from '@/components/ProgressBar'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Square, Play, Volume2, Loader2 } from 'lucide-react'
import type { Word } from '@/types'

type SpeakState = 'idle' | 'recording' | 'recorded'

// How the child left the card — parents use this to decide error-bank handling
export type SpeakOutcome = 'passed' | 'failed' | 'skipped'

// Don't let a walked-away-from mic run forever
const MAX_RECORD_MS = 30000

// Reading below this score counts as a miss and goes to the error bank
export const PASS_SCORE = 90

// Skipping is for stuck/broken situations only: the skip button stays hidden
// unless an error occurred, or this much time passed without a finished take
const STUCK_SKIP_MS = 30000

// Scoring is a required part of the loop (no offline mode): each unscored take
// asks for a retry, and this many failures aborts the session back home
const MAX_SCORE_FAILS = 3

// Listening = the word followed by its example sentence
export const speakWordAndExample = (w: Word) => tts.speakAll([baseWord(w.word), w.example])

// Example sentence with the target word (or its inflection, e.g. go → goes) highlighted
export function ExampleSentence({ word, example }: { word: string; example: string }) {
  const base = baseWord(word)
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = example.match(new RegExp(`\\b${escaped}\\w*`, 'i'))
  if (!m || m.index === undefined) return <>{example}</>
  return (
    <>
      {example.slice(0, m.index)}
      <span className="text-primary font-bold">{m[0]}</span>
      {example.slice(m.index + m[0].length)}
    </>
  )
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400'
  if (score >= 60) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500'
}

function scoreCheer(score: number): string {
  if (score >= PASS_SCORE) return '🎉 读得真棒！'
  if (score >= 60) return `👍 不错，不过没到 ${PASS_SCORE} 分，会记入错题本，再录一遍试试`
  return `💪 没到 ${PASS_SCORE} 分，会记入错题本，多跟读几遍试试`
}

interface SentenceSpeakProps {
  word: Word
  continueLabel: string // e.g. '继续拼写 →' / '下一个 →'
  skipLabel: string // emergency-exit label, e.g. '跳过发音'
  onContinue: (outcome: SpeakOutcome) => void
  onAbort: () => void // scoring service failed repeatedly — leave the session
}

// Sentence read-aloud practice card: shows the example sentence, records the
// child reading it, and plays the recording back for comparison against the
// TTS reading. When Tencent SOE is configured, the same recording is also
// scored in the cloud (overall + per word). Used by Study and ErrorBank.
export default function SentenceSpeak({ word, continueLabel, skipLabel, onContinue, onAbort }: SentenceSpeakProps) {
  const [state, setState] = useState<SpeakState>('idle')
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [scoring, setScoring] = useState(false)
  const [soeResult, setSoeResult] = useState<SoeResult | null>(null)
  const [stuck, setStuck] = useState(false)
  const [scoreFails, setScoreFails] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const soePromise = useRef<Promise<SoeSession | null> | null>(null)

  const dropSoe = () => {
    void soePromise.current?.then((s) => s?.cancel())
    soePromise.current = null
  }

  useEffect(() => {
    return () => {
      recorder.cancel()
      clearTimeout(stopTimer.current)
      void soePromise.current?.then((s) => s?.cancel())
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setStuck(true), STUCK_SKIP_MS)
    return () => clearTimeout(t)
  }, [])

  // Revoke each recording's object URL when it's replaced or on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const handleStop = useCallback(async () => {
    clearTimeout(stopTimer.current)
    const soe = soePromise.current
    soePromise.current = null
    try {
      const blob = await recorder.stop()
      setAudioUrl(URL.createObjectURL(blob))
      setState('recorded')
    } catch {
      setError('录音失败，再试一次吧')
      setState('idle')
      void soe?.then((s) => s?.cancel())
      return
    }
    // Scoring is mandatory: a take without a score (SOE misconfigured, network
    // drop, service down) counts as a failed attempt and asks for a retry
    let result: SoeResult | null = null
    const session = await soe
    if (session) {
      setScoring(true)
      result = await session.finish()
      setScoring(false)
    }
    setSoeResult(result)
    if (!result) setScoreFails((n) => n + 1)
  }, [])

  const handleRecord = useCallback(async () => {
    if (state === 'recording') {
      void handleStop()
      return
    }
    setError('')
    setSoeResult(null)
    dropSoe()
    tts.stop()
    audioRef.current?.pause()
    try {
      const stream = await recorder.start()
      setState('recording')
      soePromise.current = startSoeSession(stream, word.example)
      stopTimer.current = setTimeout(handleStop, MAX_RECORD_MS)
    } catch {
      setError('用不了麦克风，请在系统设置里允许本应用使用麦克风')
    }
  }, [state, word, handleStop])

  const handlePlayback = () => {
    tts.stop()
    const el = audioRef.current
    if (!el) return
    el.currentTime = 0
    void el.play()
  }

  const cleanup = () => {
    recorder.cancel()
    clearTimeout(stopTimer.current)
    dropSoe()
    tts.stop()
  }

  const handleContinue = (outcome: SpeakOutcome) => {
    cleanup()
    onContinue(outcome)
  }

  const handleAbort = () => {
    cleanup()
    onAbort()
  }

  // Continuing is only offered once a take has a score
  const recordedOutcome: SpeakOutcome =
    soeResult && soeResult.score >= PASS_SCORE ? 'passed' : 'failed'

  // Skipping is reserved for stuck/broken situations
  const canSkip = !!error || stuck

  // Too many unscored takes: explain and end the session
  const scoreBroken = scoreFails >= MAX_SCORE_FAILS

  return (
    <div className="flex flex-col gap-5 flex-1 animate-fade-up">
      <div className="glass-card flex w-full flex-1 flex-col justify-center gap-4 rounded-[2rem] p-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">跟读这个句子</p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-3xl font-extrabold tracking-tight">{displayWord(word.word)}</span>
          <SpeakButton onClick={() => speakWordAndExample(word)} />
        </div>
        {word.ipa && <p className="-mt-2 font-mono text-sm text-muted-foreground">{word.ipa}</p>}
        <p className="text-xl leading-relaxed font-medium">
          <ExampleSentence word={word.word} example={word.example} />
        </p>
        <p className="text-xs text-muted-foreground/80">{word.example_cn}</p>

        {/* Record button */}
        <button
          onClick={handleRecord}
          disabled={scoreBroken}
          aria-label={state === 'recording' ? '停止录音' : '开始录音'}
          className={`mx-auto mt-4 grid h-20 w-20 place-items-center rounded-full transition-all duration-200 disabled:opacity-40 ${
            state === 'recording'
              ? 'bg-red-500 text-white scale-110 animate-mic-ring'
              : 'btn-hero text-white hover:scale-105 active:scale-95'
          }`}
        >
          {state === 'recording'
            ? <Square className="h-8 w-8 fill-current" />
            : <Mic className="h-8 w-8" />}
        </button>
        {scoreBroken ? (
          <p className="text-sm font-medium leading-relaxed text-destructive">
            😞 已经连续 {MAX_SCORE_FAILS} 次没打上分。
            <br />
            可能是网络不稳定，或评分服务暂时有问题。
            <br />
            这次学习先中断，进度已保存，稍后再回来继续吧。
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {error || (
              <>
                {state === 'idle' && '点击麦克风，读出整个句子'}
                {state === 'recording' && '正在录音…读完后再点一下停止'}
                {state === 'recorded' && (
                  scoring
                    ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> 正在打分…</span>
                    : soeResult
                      ? scoreCheer(soeResult.score)
                      : `😕 打分没成功（第 ${scoreFails}/${MAX_SCORE_FAILS} 次），可能是网络不太稳定，请再录一遍`
                )}
              </>
            )}
          </p>
        )}
        {state === 'recorded' && soeResult && !scoring && (
          <div className="flex flex-col gap-2 animate-fade-up">
            <div className="flex items-center justify-center gap-3">
              <ProgressBar
                value={soeResult.score}
                className="h-2 flex-1"
                barClassName={`duration-700 ${
                  soeResult.score >= PASS_SCORE
                    ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                    : soeResult.score >= 60
                      ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
                      : 'bg-gradient-to-r from-red-400 to-rose-500'
                }`}
              />
              <span className="w-12 text-right text-sm font-bold tabular-nums">{soeResult.score}分</span>
            </div>
            {soeResult.words.length > 0 && (
              <p className="text-sm font-medium leading-relaxed">
                {soeResult.words.map((w, i) => (
                  <span key={i} className={`${scoreColor(w.score)} mx-0.5 inline-block`}>{w.word}</span>
                ))}
              </p>
            )}
          </div>
        )}
        {state === 'recorded' && (
          <div className="flex items-center justify-center gap-3 animate-fade-up">
            <Button variant="glass" className="gap-1.5" onClick={handlePlayback}>
              <Play className="h-4 w-4" /> 我的录音
            </Button>
            <Button variant="glass" className="gap-1.5" onClick={() => speakWordAndExample(word)}>
              <Volume2 className="h-4 w-4" /> 标准发音
            </Button>
          </div>
        )}
        {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}
      </div>

      {scoreBroken ? (
        <Button variant="hero" className="h-13 w-full" onClick={handleAbort}>
          返回主界面
        </Button>
      ) : state === 'recorded' ? (
        <div className="flex gap-3">
          <Button
            variant={soeResult ? 'glass' : 'hero'}
            className="h-13 flex-1 gap-1.5"
            disabled={scoring}
            onClick={handleRecord}
          >
            <Mic className="h-4 w-4" /> 再录一遍
          </Button>
          {soeResult && !scoring && (
            <Button
              variant="hero"
              className="h-13 flex-1 gap-1.5"
              onClick={() => handleContinue(recordedOutcome)}
            >
              {continueLabel}
            </Button>
          )}
        </div>
      ) : canSkip ? (
        <div className="flex flex-col items-center gap-1.5">
          <Button
            variant="glass"
            className="h-13 w-full gap-1.5 text-muted-foreground"
            onClick={() => handleContinue('skipped')}
          >
            <MicOff className="h-4 w-4" /> {skipLabel}
          </Button>
          <p className="text-xs text-muted-foreground/70">跳过会把这个单词记入错题本哦</p>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground/70">读完句子才能继续哦</p>
      )}
    </div>
  )
}
