import { useState, useEffect, useRef, useCallback } from 'react'
import { tts } from '@/services/tts'
import { recorder } from '@/services/recorder'
import { startSoeSession, unlockAudioContext, type SoeStart, type SoeResult } from '@/services/soe'
import { displayWord, findInExample } from '@/lib/word-utils'
import { speakWordAndExample } from '@/lib/speak'
import ProgressBar from '@/components/ProgressBar'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Square, Play, Volume2, Loader2 } from 'lucide-react'
import type { Word, SpeakOutcome } from '@/types'

type SpeakState = 'idle' | 'recording' | 'recorded'

// Don't let a walked-away-from mic run forever
const MAX_RECORD_MS = 30000

// Skipping is for stuck/broken situations only: the skip button stays hidden
// unless an error occurred, or this much time passed without a finished take
const STUCK_SKIP_MS = 30000

// Scoring is a required part of the loop (no offline mode): each unscored take
// asks for a retry, and this many failures aborts the session back home
const MAX_SCORE_FAILS = 3

// Example sentence with the target word (or its inflection, e.g. go → goes,
// fly → flew via `forms`) highlighted
export function ExampleSentence({ word, example, forms }: { word: string; example: string; forms?: string[] }) {
  const m = findInExample(example, word, forms)
  if (!m) return <>{example}</>
  return (
    <>
      {example.slice(0, m.index)}
      <span className="text-primary font-bold">{example.slice(m.index, m.index + m.length)}</span>
      {example.slice(m.index + m.length)}
    </>
  )
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400'
  if (score >= 60) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500'
}

function scoreCheer(score: number, passScore: number): string {
  if (score >= passScore) return '🎉 读得真棒！'
  if (score >= 60) return `👍 不错，不过没到 ${passScore} 分，会记入错题本，再录一遍试试`
  return `💪 没到 ${passScore} 分，会记入错题本，多跟读几遍试试`
}

interface SentenceSpeakProps {
  word: Word
  // Reading at or above this cloud score passes (parent setting, default 90)
  passScore: number
  continueLabel: string // e.g. '继续拼写 →' / '下一个 →'
  skipLabel: string // emergency-exit label, e.g. '跳过发音'
  // score is the cloud score of the take the child continued with, null when skipped
  onContinue: (outcome: SpeakOutcome, score: number | null) => void
  onAbort: () => void // scoring service failed repeatedly — leave the session
}

// Sentence read-aloud practice card: shows the example sentence, records the
// child reading it, and plays the recording back for comparison against the
// TTS reading. When Tencent SOE is configured, the same recording is also
// scored in the cloud (overall + per word). Used by Study and ErrorBank.
export default function SentenceSpeak({ word, passScore, continueLabel, skipLabel, onContinue, onAbort }: SentenceSpeakProps) {
  const [state, setState] = useState<SpeakState>('idle')
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [scoring, setScoring] = useState(false)
  const [soeResult, setSoeResult] = useState<SoeResult | null>(null)
  const [stuck, setStuck] = useState(false)
  const [scoreFails, setScoreFails] = useState(0)
  // Today's scoring budget is used up (server answered 429, R1)
  const [quota, setQuota] = useState<{ limit?: number } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const soePromise = useRef<Promise<SoeStart> | null>(null)

  const dropSoe = () => {
    void soePromise.current?.then((s) => s.session?.cancel())
    soePromise.current = null
  }

  useEffect(() => {
    return () => {
      recorder.cancel()
      clearTimeout(stopTimer.current)
      void soePromise.current?.then((s) => s.session?.cancel())
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
      void soe?.then((s) => s.session?.cancel())
      return
    }
    // Scoring is mandatory: a take without a score (SOE misconfigured, network
    // drop, service down) counts as a failed attempt and asks for a retry
    let result: SoeResult | null = null
    const start = await soe
    if (start?.session) {
      setScoring(true)
      result = await start.session.finish()
      setScoring(false)
    } else if (start?.failure === 'quota') {
      // Not the child's doing and retrying won't help today — stop here
      setQuota({ limit: start.limit })
      return
    }
    setSoeResult(result)
    if (!result) setScoreFails((n) => n + 1)
  }, [])

  const handleRecord = useCallback(async () => {
    if (state === 'recording') {
      void handleStop()
      return
    }
    // Still inside the tap: iOS needs the AudioContext unlocked here, before
    // the awaits below leave the gesture
    unlockAudioContext()
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
    onContinue(outcome, outcome === 'skipped' ? null : (soeResult?.score ?? null))
  }

  const handleAbort = () => {
    cleanup()
    onAbort()
  }

  // Continuing is only offered once a take has a score
  const recordedOutcome: SpeakOutcome =
    soeResult && soeResult.score >= passScore ? 'passed' : 'failed'

  // Skipping is reserved for stuck/broken situations
  const canSkip = !!error || stuck

  // Too many unscored takes: explain and end the session
  const scoreBroken = scoreFails >= MAX_SCORE_FAILS
  // Either way the session can't continue today
  const blocked = scoreBroken || quota !== null

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
          <ExampleSentence word={word.word} example={word.example} forms={word.forms} />
        </p>
        <p className="text-xs text-muted-foreground/80">{word.example_cn}</p>

        {/* Record button */}
        <button
          onClick={handleRecord}
          disabled={blocked}
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
        {quota ? (
          <p className="text-sm font-medium leading-relaxed text-amber-600 dark:text-amber-400">
            😴 今天的发音练习次数已经用完了{quota.limit ? `（每天 ${quota.limit} 次）` : ''}。
            <br />
            明天再来吧，进度已保存。
          </p>
        ) : scoreBroken ? (
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
                      ? scoreCheer(soeResult.score, passScore)
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
                  soeResult.score >= passScore
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
        {state === 'recorded' && !quota && (
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

      {blocked ? (
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
