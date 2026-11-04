import { useState, type ReactNode } from 'react'
import { tts } from '@/services/tts'
import { gapFor } from '@/lib/exercise'
import { Button } from '@/components/ui/button'
import { Volume2, Lightbulb } from 'lucide-react'
import type { Word } from '@/types'

// Sentence gap-fill prompt: the example with the target word (or its
// inflection) blanked out, first letter given. Hear the sentence or reveal
// the Chinese meaning as hints; the input lives in the parent.
export default function GapFillPrompt({ word, children }: { word: Word; children?: ReactNode }) {
  const [revealed, setRevealed] = useState(false)
  const gap = gapFor(word)
  if (!gap) return null
  const blank = gap.answer[0] + '_'.repeat(Math.max(1, gap.answer.length - 1))
  // Reading the sentence aloud would give the answer away — the hint reads around the gap
  const hearAround = () => tts.speakAll([gap.before.trim() || '…', gap.after.trim() || '…'].filter((s) => s !== '…'))

  return (
    <div className="glass-card flex w-full flex-1 flex-col items-center justify-center gap-4 rounded-[2rem] p-8 text-center">
      <span className="glass-chip rounded-full px-2.5 py-0.5 text-xs font-semibold text-primary">✏️ 例句填空</span>
      <p className="text-xl leading-relaxed font-medium">
        {gap.before}
        <span className="mx-1 inline-block rounded-lg bg-primary/10 px-2 font-mono tracking-widest text-primary">{blank}</span>
        {gap.after}
      </p>
      <p className="text-sm text-muted-foreground">{word.example_cn}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="glass" className="h-9 gap-1.5 px-3 text-xs" onClick={hearAround}>
          <Volume2 className="h-3.5 w-3.5" /> 听句子
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
        </div>
      )}
      {children}
    </div>
  )
}
