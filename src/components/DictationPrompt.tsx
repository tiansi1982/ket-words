import { useEffect, useState, type ReactNode } from 'react'
import { tts } from '@/services/tts'
import { baseWord } from '@/lib/word-utils'
import { Button } from '@/components/ui/button'
import { Volume2, MessageSquareText, Lightbulb } from 'lucide-react'
import type { Word } from '@/types'

// Dictation prompt (F4): the word is played, not shown. The child can replay
// it, hear the example sentence, or reveal the Chinese as a hint; the
// spelling input lives in the parent.
export default function DictationPrompt({ word, children }: { word: Word; children?: ReactNode }) {
  const [revealed, setRevealed] = useState(false)
  const base = baseWord(word.word)

  useEffect(() => {
    tts.speak(base)
  }, [base])

  return (
    <div className="glass-card flex w-full flex-1 flex-col items-center justify-center gap-4 rounded-[2rem] p-8 text-center">
      <span className="glass-chip rounded-full px-2.5 py-0.5 text-xs font-semibold text-primary">🎧 听写</span>
      <button
        onClick={() => tts.speak(base)}
        aria-label="再听一遍"
        className="btn-hero grid h-20 w-20 place-items-center rounded-full text-white transition-transform hover:scale-105 active:scale-95"
      >
        <Volume2 className="h-8 w-8" />
      </button>
      <p className="text-xs text-muted-foreground">听单词，把它拼出来；点喇叭再听一遍</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="glass" className="h-9 gap-1.5 px-3 text-xs" onClick={() => tts.speakAll([base, word.example])}>
          <MessageSquareText className="h-3.5 w-3.5" /> 听例句
        </Button>
        {!revealed && (
          <Button variant="glass" className="h-9 gap-1.5 px-3 text-xs" onClick={() => setRevealed(true)}>
            <Lightbulb className="h-3.5 w-3.5" /> 中文提示
          </Button>
        )}
      </div>
      {revealed && (
        <div className="animate-fade-up">
          <p className="text-sm text-muted-foreground">{word.pos_cn}</p>
          <p className="text-2xl font-bold tracking-tight">{word.definition}</p>
          <p className="mt-1 text-sm text-muted-foreground italic">{word.example_cn}</p>
        </div>
      )}
      {children}
    </div>
  )
}
