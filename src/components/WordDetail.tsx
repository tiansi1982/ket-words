import { useEffect } from 'react'
import { useUserStore } from '@/store/userStore'
import { displayWord } from '@/lib/word-utils'
import { speakWordAndExample } from '@/lib/speak'
import { wordStatus, dueText, STATUS_META } from '@/lib/word-status'
import { ExampleSentence } from '@/components/SentenceSpeak'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import { X, Volume2, CircleCheck, RotateCcw } from 'lucide-react'
import type { Word } from '@/types'

interface WordDetailProps {
  word: Word | null
  onClose: () => void
  // known=true → mark as already known; false → back to new
  onToggleKnown: (word: Word, known: boolean) => void
}

// Bottom sheet with everything about one word: entry, example, learning
// record and schedule, plus listen / mark-known actions (F1/F2).
export default function WordDetail({ word, onClose, onToggleKnown }: WordDetailProps) {
  return word ? <Sheet word={word} onClose={onClose} onToggleKnown={onToggleKnown} /> : null
}

function daysAgo(ts: number | undefined): string | null {
  if (!ts) return null
  const d = Math.floor((Date.now() - ts) / 86_400_000)
  return d <= 0 ? '今天' : `${d} 天前`
}

function Sheet({ word, onClose, onToggleKnown }: WordDetailProps & { word: Word }) {
  const { progress, errorBank, getTodayDate } = useUserStore()
  const today = getTodayDate()
  const p = progress[word.id]
  const status = wordStatus(p, today)
  const meta = STATUS_META[status]
  const inErrorBank = errorBank.includes(word.id)
  const known = status === 'mastered' || status === 'due' || status === 'graduated'
  const studied = daysAgo(p?.lastStudied)
  const due = dueText(p, today)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${displayWord(word.word)} 详情`}
        onClick={(e) => e.stopPropagation()}
        className="glass-card max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] px-6 pb-8 pt-3 animate-fade-up"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="truncate text-3xl font-extrabold tracking-tight">{displayWord(word.word)}</span>
              <SpeakButton onClick={() => speakWordAndExample(word)} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {word.ipa && <span className="font-mono">{word.ipa}</span>}
              <span className="glass-chip rounded-full px-2 py-0.5 text-xs font-medium">{word.pos_cn}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.chip}`}>{meta.label}</span>
              {inErrorBank && (
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-300">错题本</span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="关闭" className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-xl font-bold">{word.definition}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground italic">
          <ExampleSentence word={word.word} example={word.example} forms={word.forms} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground/80">{word.example_cn}</p>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="glass-chip rounded-2xl px-2 py-2.5">
            <div className="text-lg font-extrabold tabular-nums text-green-600 dark:text-green-400">{p?.correctCount ?? 0}</div>
            <div className="text-[11px] text-muted-foreground">答对</div>
          </div>
          <div className="glass-chip rounded-2xl px-2 py-2.5">
            <div className="text-lg font-extrabold tabular-nums text-red-500">{p?.wrongCount ?? 0}</div>
            <div className="text-[11px] text-muted-foreground">答错</div>
          </div>
          <div className="glass-chip rounded-2xl px-2 py-2.5">
            <div className="text-lg font-extrabold tabular-nums text-amber-600 dark:text-amber-400">{p?.speakFailCount ?? 0}</div>
            <div className="text-[11px] text-muted-foreground">跟读没过</div>
          </div>
        </div>
        {(studied || due) && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {studied && `上次学习：${studied}`}
            {studied && due && ' · '}
            {due}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <Button variant="glass" className="h-12 flex-1 gap-1.5" onClick={() => speakWordAndExample(word)}>
            <Volume2 className="h-4 w-4" /> 朗读
          </Button>
          {known ? (
            <Button variant="glass" className="h-12 flex-1 gap-1.5 text-destructive" onClick={() => onToggleKnown(word, false)}>
              <RotateCcw className="h-4 w-4" /> 重新学
            </Button>
          ) : (
            <Button variant="hero" className="h-12 flex-1 gap-1.5" onClick={() => onToggleKnown(word, true)}>
              <CircleCheck className="h-4 w-4" /> 我已经会了
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
