import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { tts } from '@/services/tts'
import { baseWord, shuffled } from '@/lib/word-utils'
import PageHeader from '@/components/PageHeader'
import ProgressBar from '@/components/ProgressBar'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import { RotateCcw } from 'lucide-react'
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

  const [round, setRound] = useState(0)

  // Pick BATCH unmastered words (or any words if not enough); reshuffled each round
  const practiceWords = useMemo(() => {
    const masteredIds = new Set(
      Object.values(progress)
        .filter((p) => p.status === 'mastered')
        .map((p) => p.wordId)
    )
    const pool = words.filter((w) => !masteredIds.has(w.id))
    const source = pool.length >= BATCH ? pool : words
    return shuffled(source).slice(0, BATCH)
  }, [round]) // eslint-disable-line react-hooks/exhaustive-deps

  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const restart = () => {
    setRound((r) => r + 1)
    setIndex(0)
    setSelected(null)
    setScore(0)
    setDone(false)
  }

  const current = practiceWords[index]
  const options = useMemo(
    () => (current ? buildOptions(current, words) : []),
    [index, practiceWords] // eslint-disable-line react-hooks/exhaustive-deps
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
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card flex flex-col items-center gap-4 rounded-[2rem] p-10 text-center animate-pop-in">
          <p className="text-muted-foreground font-medium">没有可练习的单词</p>
          <Button variant="hero" className="h-11 px-8" onClick={() => navigate('/')}>
            返回首页
          </Button>
        </div>
      </div>
    )
  }

  if (done) {
    const pct = Math.round((score / practiceWords.length) * 100)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-7xl animate-pop-in">{pct >= 80 ? '🏆' : pct >= 60 ? '👍' : '💪'}</div>
        <h2 className="text-3xl font-extrabold tracking-tight animate-fade-up">练习结束！</h2>
        <p className="text-muted-foreground text-lg animate-fade-up [animation-delay:80ms]">
          {practiceWords.length} 题中答对 <span className="font-bold text-foreground tabular-nums">{score}</span> 题
        </p>
        <ProgressBar
          value={pct}
          className="h-3 max-w-xs animate-fade-up [animation-delay:140ms]"
          barClassName={`duration-700 ${
            pct >= 80
              ? 'bg-gradient-to-r from-green-400 to-emerald-500'
              : pct >= 60
                ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
                : 'progress-gradient'
          }`}
        />
        <p className="text-4xl font-extrabold tracking-tight tabular-nums text-gradient">{pct}%</p>
        <div className="mt-2 flex gap-3 animate-fade-up [animation-delay:200ms]">
          <Button variant="glass" className="h-12 px-7" onClick={() => navigate('/')}>
            返回首页
          </Button>
          <Button variant="hero" className="h-12 gap-2 px-7" onClick={restart}>
            <RotateCcw className="h-4 w-4" /> 再练一组
          </Button>
        </div>
      </div>
    )
  }

  const answered = selected !== null
  const correct = answered && selected === current.id

  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <PageHeader counter={`${index + 1} / ${practiceWords.length}`} />
      <ProgressBar value={(index / practiceWords.length) * 100} className="mb-7 h-1.5" />

      {/* Question card */}
      <div className="glass-card mb-5 rounded-[2rem] p-7 animate-fade-up">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{current.pos_cn}</p>
        <p className="mb-4 text-2xl font-extrabold tracking-tight">{current.definition}</p>
        <p className="text-sm leading-relaxed text-muted-foreground italic">{current.example_cn}</p>

        {/* Show word + TTS after answering */}
        {answered && (
          <div className="mt-5 flex items-center justify-center gap-2.5 border-t border-border/70 pt-5 animate-fade-up">
            <span className="text-3xl font-extrabold tracking-tight text-gradient">{current.word}</span>
            <SpeakButton onClick={() => tts.speak(baseWord(current.word))} label="朗读单词" />
          </div>
        )}
      </div>

      {/* Options */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        {options.map((opt) => {
          // No standalone backdrop-blur here: glass-card already supplies the blur,
          // and four simultaneously blurred tiles are expensive on low-end tablets
          let cls = 'rounded-2xl border p-4 text-center text-base font-semibold transition-all duration-200 '
          if (!answered) {
            cls +=
              'glass-card cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg active:scale-[0.97]'
          } else if (opt.id === current.id) {
            cls += 'border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-300 animate-pop-in'
          } else if (opt.id === selected) {
            cls += 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-300 animate-pop-in'
          } else {
            cls += 'border-border/60 bg-muted/40 text-muted-foreground opacity-60'
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
        <div className="flex flex-col gap-3 animate-fade-up">
          <p className={`text-center font-semibold ${correct ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
            {correct ? '✅ 回答正确！' : `❌ 正确答案是 "${current.word}"`}
          </p>
          <Button variant="hero" className="h-14 w-full text-base" onClick={handleNext}>
            {index + 1 < practiceWords.length ? '下一题 →' : '查看成绩 🎉'}
          </Button>
        </div>
      )}
    </div>
  )
}
