import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { tts } from '@/services/tts'
import { baseWord, shuffled } from '@/lib/word-utils'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Volume2, RotateCcw } from 'lucide-react'
import type { Word } from '@/types'

const BATCH = 10

function buildOptions(correct: Word, pool: Word[]): Word[] {
  // Exclude synonyms (same definition would make two options correct) and
  // entries with the same spelling (would render two identical buttons)
  const correctBase = baseWord(correct.word).toLowerCase()
  const ok = (w: Word) =>
    w.id !== correct.id &&
    w.definition !== correct.definition &&
    baseWord(w.word).toLowerCase() !== correctBase
  // Same part of speech first — makes distractors grammatically plausible;
  // fall back to other pos if the bucket runs dry (e.g. exclam has only 19)
  const samePos = shuffled(pool.filter((w) => ok(w) && w.pos === correct.pos))
  const otherPos = shuffled(pool.filter((w) => ok(w) && w.pos !== correct.pos))
  const distractors: Word[] = []
  const usedText = new Set([correctBase])
  for (const w of [...samePos, ...otherPos]) {
    const text = baseWord(w.word).toLowerCase()
    if (usedText.has(text)) continue
    usedText.add(text)
    distractors.push(w)
    if (distractors.length === 3) break
  }
  return shuffled([...distractors, correct])
}

export default function Practice() {
  const navigate = useNavigate()
  const { progress, updateProgress, addToErrorBank } = useUserStore()
  const { words } = useWordStore()

  // Pick BATCH unmastered words (or any words if not enough)
  const practiceWords = useMemo(() => {
    const masteredIds = new Set(
      Object.values(progress)
        .filter((p) => p.status === 'mastered')
        .map((p) => p.wordId)
    )
    const pool = words.filter((w) => !masteredIds.has(w.id))
    const source = pool.length >= BATCH ? pool : words
    return shuffled(source).slice(0, BATCH)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const current = practiceWords[index]
  const options = useMemo(
    () => (current ? buildOptions(current, words) : []),
    [index] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleSelect = (word: Word) => {
    if (selected !== null) return
    setSelected(word.id)
    const correct = word.id === current.id
    if (correct) {
      setScore((s) => s + 1)
      updateProgress(current.id, true)
    } else {
      updateProgress(current.id, false)
      addToErrorBank(current.id)
    }
    tts.speak(baseWord(current.word))
  }

  const handleNext = () => {
    if (index + 1 >= practiceWords.length) {
      setDone(true)
    } else {
      setIndex((i) => i + 1)
      setSelected(null)
    }
  }

  if (practiceWords.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">没有可练习的单词</p>
          <Button onClick={() => navigate('/')}>返回首页</Button>
        </div>
      </div>
    )
  }

  if (done) {
    const pct = Math.round((score / practiceWords.length) * 100)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-6xl">{pct >= 80 ? '🏆' : pct >= 60 ? '👍' : '💪'}</div>
        <h2 className="text-2xl font-bold">练习结束！</h2>
        <p className="text-muted-foreground text-lg">
          {practiceWords.length} 题中答对 <span className="font-bold text-foreground">{score}</span> 题
        </p>
        <div className="w-full max-w-xs bg-muted rounded-full h-4">
          <div
            className={`h-4 rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-3xl font-bold">{pct}%</p>
        <div className="flex gap-3 mt-2">
          <Button variant="outline" className="h-12 rounded-2xl px-6" onClick={() => navigate('/')}>
            返回首页
          </Button>
          <Button className="h-12 rounded-2xl px-6" onClick={() => window.location.reload()}>
            <RotateCcw className="h-4 w-4 mr-2" /> 再练一组
          </Button>
        </div>
      </div>
    )
  }

  const answered = selected !== null
  const correct = answered && selected === current.id

  return (
    <div className="min-h-screen flex flex-col px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm text-muted-foreground font-medium">
          {index + 1} / {practiceWords.length}
        </span>
        <div className="w-10" />
      </div>

      {/* Progress */}
      <div className="w-full bg-muted rounded-full h-2 mb-6">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-500"
          style={{ width: `${(index / practiceWords.length) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <div className="bg-card border rounded-3xl p-6 mb-5 shadow-sm">
        <p className="text-xs text-muted-foreground mb-1">{current.pos_cn}</p>
        <p className="text-xl font-bold mb-4">{current.definition}</p>
        <p className="text-sm text-muted-foreground italic leading-relaxed">{current.example_cn}</p>

        {/* Show word + TTS after answering */}
        {answered && (
          <div className="mt-4 pt-4 border-t flex items-center justify-center gap-2">
            <span className="text-2xl font-bold">{current.word}</span>
            <button
              onClick={() => tts.speak(baseWord(current.word))}
              className="text-muted-foreground hover:text-primary"
            >
              <Volume2 className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {options.map((opt) => {
          let cls = 'border rounded-2xl p-4 text-center font-medium text-base transition-all '
          if (!answered) {
            cls += 'bg-card hover:bg-muted hover:border-primary cursor-pointer'
          } else if (opt.id === current.id) {
            cls += 'bg-green-100 border-green-400 dark:bg-green-950/30 dark:border-green-600'
          } else if (opt.id === selected) {
            cls += 'bg-red-100 border-red-400 dark:bg-red-950/30 dark:border-red-600'
          } else {
            cls += 'bg-muted/50 border-border opacity-60'
          }

          return (
            <button key={opt.id} className={cls} onClick={() => handleSelect(opt)}>
              {opt.word}
            </button>
          )
        })}
      </div>

      {/* Feedback + next */}
      {answered && (
        <div className="flex flex-col gap-3">
          <p className={`text-center font-medium ${correct ? 'text-green-600' : 'text-red-500'}`}>
            {correct ? '✅ 回答正确！' : `❌ 正确答案是 "${current.word}"`}
          </p>
          <Button className="w-full h-14 text-base rounded-2xl" onClick={handleNext}>
            {index + 1 < practiceWords.length ? '下一题 →' : '查看成绩 🎉'}
          </Button>
        </div>
      )}
    </div>
  )
}
