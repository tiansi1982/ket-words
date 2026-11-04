import { useEffect } from 'react'
import { tts } from '@/services/tts'
import { baseWord } from '@/lib/word-utils'
import { Volume2 } from 'lucide-react'
import type { Word } from '@/types'

// Hear the word, pick it from four spellings (placement test, practice).
// Mounting plays it once; the button replays. `revealed` shows the meaning
// after answering.
export default function AudioChoicePrompt({ word, revealed }: { word: Word; revealed: boolean }) {
  const base = baseWord(word.word)
  useEffect(() => {
    tts.speak(base)
  }, [base])
  return (
    <div className="glass-card mb-5 flex flex-col items-center gap-3 rounded-[2rem] p-7 text-center animate-fade-up">
      <p className="text-xs font-medium text-muted-foreground">听发音 · 选出听到的单词</p>
      <button
        onClick={() => tts.speak(base)}
        aria-label="再听一遍"
        className="btn-hero grid h-16 w-16 place-items-center rounded-full text-white transition-transform hover:scale-105 active:scale-95"
      >
        <Volume2 className="h-7 w-7" />
      </button>
      {revealed && (
        <p className="text-sm text-muted-foreground">
          {word.pos_cn} · {word.definition}
        </p>
      )}
    </div>
  )
}
