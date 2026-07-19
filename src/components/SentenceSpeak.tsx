import { useState, useEffect, useCallback } from 'react'
import { tts } from '@/services/tts'
import { speechAssessment } from '@/services/speechAssessment'
import { baseWord, displayWord } from '@/lib/word-utils'
import ProgressBar from '@/components/ProgressBar'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import type { Word } from '@/types'

type SpeakState = 'idle' | 'listening' | 'done'

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

interface SentenceSpeakProps {
  word: Word
  continueLabel: string // e.g. '继续拼写 →' / '下一个 →'
  skipLabel: string // shown before a recording finishes, e.g. '跳过发音'
  onContinue: () => void
}

// Sentence read-aloud practice card: shows the example sentence, records the
// child reading it, and scores the pronunciation. Used by Study and ErrorBank.
export default function SentenceSpeak({ word, continueLabel, skipLabel, onContinue }: SentenceSpeakProps) {
  const [state, setState] = useState<SpeakState>('idle')
  const [transcript, setTranscript] = useState('')
  const [score, setScore] = useState(0)
  const [passed, setPassed] = useState(false)

  useEffect(() => {
    return () => { speechAssessment.cancel() }
  }, [])

  const handleSpeak = useCallback(async () => {
    if (state === 'listening') return
    setState('listening')
    setTranscript('')
    tts.stop()
    try {
      const result = await speechAssessment.assess(word.example)
      setTranscript(result.transcript)
      setScore(result.score)
      setPassed(result.passed)
      setState('done')
    } catch {
      setState('idle')
    }
  }, [word, state])

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

        {/* Mic button */}
        <button
          onClick={handleSpeak}
          disabled={state === 'listening'}
          aria-label="开始录音"
          className={`mx-auto mt-4 grid h-20 w-20 place-items-center rounded-full transition-all duration-200 ${
            state === 'listening'
              ? 'bg-red-500 text-white scale-110 animate-mic-ring'
              : 'btn-hero text-white hover:scale-105 active:scale-95'
          }`}
        >
          {state === 'listening'
            ? <Loader2 className="h-8 w-8 animate-spin" />
            : <Mic className="h-8 w-8" />}
        </button>
        <p className="text-xs text-muted-foreground">
          {state === 'idle' && '点击麦克风，读出整个句子'}
          {state === 'listening' && '正在聆听...'}
          {state === 'done' && (
            passed
              ? `✅ 读得不错！识别为 "${transcript}"`
              : `❌ 再试试！识别为 "${transcript || '未识别'}"`
          )}
        </p>
        {state === 'done' && (
          <div className="flex items-center justify-center gap-3 animate-fade-up">
            <ProgressBar
              value={score}
              className="h-2 flex-1"
              barClassName={`duration-700 ${
                score >= 70
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                  : 'bg-gradient-to-r from-amber-400 to-yellow-500'
              }`}
            />
            <span className="w-12 text-right text-sm font-bold tabular-nums">{score}分</span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {state === 'done' && (
          <Button variant="glass" className="h-13 flex-1 gap-1.5" onClick={handleSpeak}>
            <Mic className="h-4 w-4" /> 再试一次
          </Button>
        )}
        <Button variant="hero" className="h-13 flex-1 gap-1.5" onClick={onContinue}>
          {state === 'done' ? continueLabel : (
            <>
              <MicOff className="h-4 w-4" /> {skipLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
