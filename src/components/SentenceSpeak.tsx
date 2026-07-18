import { useState, useEffect, useCallback } from 'react'
import { tts } from '@/services/tts'
import { speechAssessment } from '@/services/speechAssessment'
import { baseWord } from '@/lib/word-utils'
import { Button } from '@/components/ui/button'
import { Volume2, Mic, MicOff, Loader2 } from 'lucide-react'
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
    <div className="flex flex-col gap-5 flex-1">
      <div className="bg-card border rounded-3xl p-8 w-full text-center shadow-sm flex-1 flex flex-col justify-center gap-4">
        <p className="text-muted-foreground text-sm">跟读这个句子</p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-2xl font-bold">{word.word}</span>
          <button onClick={() => speakWordAndExample(word)} className="text-muted-foreground hover:text-primary">
            <Volume2 className="h-5 w-5" />
          </button>
        </div>
        {word.ipa && <p className="text-sm text-muted-foreground font-mono -mt-2">{word.ipa}</p>}
        <p className="text-xl leading-relaxed">
          <ExampleSentence word={word.word} example={word.example} />
        </p>
        <p className="text-xs text-muted-foreground">{word.example_cn}</p>

        {/* Mic button */}
        <button
          onClick={handleSpeak}
          disabled={state === 'listening'}
          className={`mx-auto mt-4 w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-md ${
            state === 'listening'
              ? 'bg-red-500 text-white animate-pulse scale-110'
              : 'bg-primary text-primary-foreground hover:scale-105 active:scale-95'
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
          <div className="flex items-center justify-center gap-2">
            <div className="flex-1 bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${score >= 70 ? 'bg-green-500' : 'bg-yellow-500'}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="text-sm font-medium w-12 text-right">{score}分</span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {state === 'done' && (
          <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={handleSpeak}>
            <Mic className="h-4 w-4 mr-1" /> 再试一次
          </Button>
        )}
        <Button className="flex-1 h-12 rounded-2xl" onClick={onContinue}>
          {state === 'done' ? continueLabel : (
            <>
              <MicOff className="h-4 w-4 mr-1" /> {skipLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
