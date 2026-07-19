import { useState, useEffect, useRef, useCallback } from 'react'
import { tts } from '@/services/tts'
import { recorder } from '@/services/recorder'
import { baseWord, displayWord } from '@/lib/word-utils'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Square, Play, Volume2 } from 'lucide-react'
import type { Word } from '@/types'

type SpeakState = 'idle' | 'recording' | 'recorded'

// Don't let a walked-away-from mic run forever
const MAX_RECORD_MS = 30000

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
// child reading it, and plays the recording back for comparison against the
// TTS reading. Used by Study and ErrorBank.
export default function SentenceSpeak({ word, continueLabel, skipLabel, onContinue }: SentenceSpeakProps) {
  const [state, setState] = useState<SpeakState>('idle')
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      recorder.cancel()
      clearTimeout(stopTimer.current)
    }
  }, [])

  // Revoke each recording's object URL when it's replaced or on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const handleStop = useCallback(async () => {
    clearTimeout(stopTimer.current)
    try {
      const blob = await recorder.stop()
      setAudioUrl(URL.createObjectURL(blob))
      setState('recorded')
    } catch {
      setError('录音失败，再试一次吧')
      setState('idle')
    }
  }, [])

  const handleRecord = useCallback(async () => {
    if (state === 'recording') {
      void handleStop()
      return
    }
    setError('')
    tts.stop()
    audioRef.current?.pause()
    try {
      await recorder.start()
      setState('recording')
      stopTimer.current = setTimeout(handleStop, MAX_RECORD_MS)
    } catch {
      setError('用不了麦克风，请在系统设置里允许本应用使用麦克风')
    }
  }, [state, handleStop])

  const handlePlayback = () => {
    tts.stop()
    const el = audioRef.current
    if (!el) return
    el.currentTime = 0
    void el.play()
  }

  const handleContinue = () => {
    recorder.cancel()
    clearTimeout(stopTimer.current)
    tts.stop()
    onContinue()
  }

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
          aria-label={state === 'recording' ? '停止录音' : '开始录音'}
          className={`mx-auto mt-4 grid h-20 w-20 place-items-center rounded-full transition-all duration-200 ${
            state === 'recording'
              ? 'bg-red-500 text-white scale-110 animate-mic-ring'
              : 'btn-hero text-white hover:scale-105 active:scale-95'
          }`}
        >
          {state === 'recording'
            ? <Square className="h-8 w-8 fill-current" />
            : <Mic className="h-8 w-8" />}
        </button>
        <p className="text-xs text-muted-foreground">
          {error || (
            <>
              {state === 'idle' && '点击麦克风，读出整个句子'}
              {state === 'recording' && '正在录音…读完后再点一下停止'}
              {state === 'recorded' && '🎧 听听自己读的，和标准发音比一比'}
            </>
          )}
        </p>
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

      <div className="flex gap-3">
        {state === 'recorded' && (
          <Button variant="glass" className="h-13 flex-1 gap-1.5" onClick={handleRecord}>
            <Mic className="h-4 w-4" /> 再录一遍
          </Button>
        )}
        <Button variant="hero" className="h-13 flex-1 gap-1.5" onClick={handleContinue}>
          {state === 'recorded' ? continueLabel : (
            <>
              <MicOff className="h-4 w-4" /> {skipLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
