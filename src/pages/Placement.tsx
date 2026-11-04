import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { tts } from '@/services/tts'
import { baseWord, displayWord, difficultyOf, type Difficulty } from '@/lib/word-utils'
import {
  buildWordOptions, buildDefinitionOptions, sampleByDifficulty, estimateKnown, bucketSizes,
  PLACEMENT_QUOTA, type DifficultyQuota, type DefinitionOption, type BucketScore,
} from '@/lib/exercise'
import PageHeader, { BackButton } from '@/components/PageHeader'
import ProgressBar from '@/components/ProgressBar'
import SpeakButton from '@/components/SpeakButton'
import AudioChoicePrompt from '@/components/AudioChoicePrompt'
import { Button } from '@/components/ui/button'
import { Languages, Headphones, Clock, CircleCheck } from 'lucide-react'
import type { Word } from '@/types'

// Placement test (F3): a stratified sample of the dictionary, recognition
// questions only (word → meaning, audio → word). Right answers are marked
// as already known; the per-difficulty accuracy is projected onto the whole
// list and used to pick harder new words from day one. Nothing here touches
// the daily log or the error bank.
type Kind = 'en2cn' | 'audio'
interface Question {
  word: Word
  kind: Kind
  wordOptions?: Word[]
  defOptions?: DefinitionOption[]
}

const LEVELS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: '简单' },
  { key: 'medium', label: '中等' },
  { key: 'hard', label: '困难' },
]

const optionCls = (state: 'idle' | 'correct' | 'wrong' | 'dim') => {
  const base = 'rounded-2xl border p-4 text-center text-base font-semibold transition-all duration-200 '
  if (state === 'idle') return base + 'glass-card cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg active:scale-[0.97]'
  if (state === 'correct') return base + 'border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-300 animate-pop-in'
  if (state === 'wrong') return base + 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-300 animate-pop-in'
  return base + 'border-border/60 bg-muted/40 text-muted-foreground opacity-60'
}

export default function Placement({ quota = PLACEMENT_QUOTA }: { quota?: DifficultyQuota }) {
  const navigate = useNavigate()
  const { getMasteredIds, markKnown, setPlacement, getTodayDate } = useUserStore()
  const words = useWordStore((s) => s.words)

  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [pick, setPick] = useState<number | null>(null)
  const [results, setResults] = useState<{ word: Word; correct: boolean }[]>([])
  const [finished, setFinished] = useState<{ correct: number; estimated: number; scores: Record<Difficulty, BucketScore> } | null>(null)

  const questions = useMemo<Question[]>(() => {
    if (!started) return []
    const sample = sampleByDifficulty(words, quota, getMasteredIds())
    return sample.map((word, i) => {
      const kind: Kind = i % 2 === 0 ? 'en2cn' : 'audio'
      return kind === 'en2cn'
        ? { word, kind, defOptions: buildDefinitionOptions(word, words) }
        : { word, kind, wordOptions: buildWordOptions(word, words) }
    })
  }, [started]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = Object.values(quota).reduce((a, b) => a + b, 0)
  const current = questions[index]

  const answer = (wordId: number) => {
    if (pick !== null || !current) return
    setPick(wordId)
    setResults((r) => [...r, { word: current.word, correct: wordId === current.word.id }])
    if (current.kind === 'en2cn') tts.speak(baseWord(current.word.word))
  }

  const next = () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1)
      setPick(null)
      return
    }
    // Score, mark, estimate
    const scores: Record<Difficulty, BucketScore> = { easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } }
    for (const r of results) {
      const b = scores[difficultyOf(r.word.word)]
      b.total++
      if (r.correct) b.correct++
    }
    const correctIds = results.filter((r) => r.correct).map((r) => r.word.id)
    const estimated = Math.max(correctIds.length, estimateKnown(scores, bucketSizes(words)))
    markKnown(correctIds)
    setPlacement({ date: getTodayDate(), correct: correctIds.length, total: results.length, estimated })
    setFinished({ correct: correctIds.length, estimated, scores })
  }

  if (!started) {
    return (
      <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
        <div className="mb-7 flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-extrabold tracking-tight">摸底测试</h1>
        </div>
        <div className="glass-card rounded-[2rem] p-6 animate-fade-up">
          <div className="text-5xl">📋</div>
          <h2 className="mt-3 text-xl font-bold">先看看你已经认识多少词</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm">
            <li className="flex gap-3"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{total} 道题，大约 5 分钟；按简单、中等、困难分层抽取</span></li>
            <li className="flex gap-3"><Languages className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>两种题：看单词选意思、听发音选单词，不用拼写</span></li>
            <li className="flex gap-3"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>答对的词直接标为"已会"，一周后开始复习；之后每天的新词也会根据结果调难度</span></li>
            <li className="flex gap-3"><Headphones className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>不计分、不进错题本，不会就猜一个</span></li>
          </ul>
        </div>
        <Button variant="hero" className="mt-6 h-14 w-full text-base" onClick={() => setStarted(true)}>
          开始测试
        </Button>
        <Button variant="glass" className="mt-3 h-12 w-full" onClick={() => navigate('/')}>
          先不做了
        </Button>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="min-h-screen flex flex-col px-5 py-8 max-w-lg mx-auto w-full">
        <div className="flex flex-col items-center text-center">
          <div className="text-6xl animate-pop-in">🎯</div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight animate-fade-up">测完了！</h2>
          <p className="mt-2 text-sm text-muted-foreground tabular-nums animate-fade-up [animation-delay:80ms]">
            {questions.length} 题答对 {finished.correct} 题
          </p>
        </div>
        <div className="glass-card mt-6 rounded-[1.75rem] p-6 text-center animate-fade-up [animation-delay:140ms]">
          <div className="text-xs font-medium text-muted-foreground">预计你已经认识</div>
          <div className="mt-1 text-5xl font-extrabold tracking-tight tabular-nums text-gradient">{finished.estimated}</div>
          <div className="mt-1 text-xs text-muted-foreground">个词（共 {words.length} 个）</div>
        </div>
        <div className="glass-card mt-4 flex flex-col gap-4 rounded-[1.75rem] p-6 animate-fade-up [animation-delay:200ms]">
          {LEVELS.map(({ key, label }) => {
            const b = finished.scores[key]
            return (
              <div key={key}>
                <div className="mb-1.5 flex justify-between text-xs font-medium text-muted-foreground">
                  <span>{label}</span>
                  <span className="tabular-nums">{b.correct} / {b.total}</span>
                </div>
                <ProgressBar value={b.total ? (b.correct / b.total) * 100 : 0} className="h-2" />
              </div>
            )
          })}
        </div>
        <p className="mt-4 px-1 text-center text-xs leading-relaxed text-muted-foreground">
          答对的 {finished.correct} 个词已标为已会，一周后开始复习；每天的新词会按这个结果多排一些中等和困难词。
        </p>
        <Button variant="hero" className="mt-6 h-14 w-full text-base animate-fade-up [animation-delay:260ms]" onClick={() => navigate('/')}>
          去开始今日学习
        </Button>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card flex flex-col items-center gap-4 rounded-[2rem] p-10 text-center animate-pop-in">
          <p className="font-medium text-muted-foreground">没有可测的词了</p>
          <Button variant="hero" className="h-11 px-7" onClick={() => navigate('/')}>返回首页</Button>
        </div>
      </div>
    )
  }

  const { word, kind } = current
  const answered = pick !== null
  const correct = pick === word.id

  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <PageHeader counter={`摸底 ${index + 1} / ${questions.length}`} />
      <ProgressBar value={(index / questions.length) * 100} className="mb-7 h-1.5" />

      {kind === 'en2cn' ? (
        <div className="glass-card mb-5 rounded-[2rem] p-7 text-center animate-fade-up">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{word.pos_cn} · 它是什么意思？</p>
          <div className="flex items-center justify-center gap-2.5">
            <span className="text-3xl font-extrabold tracking-tight">{displayWord(word.word)}</span>
            <SpeakButton onClick={() => tts.speak(baseWord(word.word))} label="朗读单词" />
          </div>
          {word.ipa && <p className="mt-1 font-mono text-sm text-muted-foreground">{word.ipa}</p>}
        </div>
      ) : (
        <AudioChoicePrompt key={word.id} word={word} revealed={answered} />
      )}

      {kind === 'en2cn' && current.defOptions && (
        <div className="mb-5 grid grid-cols-1 gap-3">
          {current.defOptions.map((opt) => {
            const state = !answered ? 'idle' : opt.wordId === word.id ? 'correct' : opt.wordId === pick ? 'wrong' : 'dim'
            return (
              <button key={opt.wordId} className={optionCls(state)} onClick={() => answer(opt.wordId)}>{opt.text}</button>
            )
          })}
        </div>
      )}
      {kind === 'audio' && current.wordOptions && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          {current.wordOptions.map((opt) => {
            const state = !answered ? 'idle' : opt.id === word.id ? 'correct' : opt.id === pick ? 'wrong' : 'dim'
            return (
              <button key={opt.id} className={optionCls(state)} onClick={() => answer(opt.id)}>{displayWord(opt.word)}</button>
            )
          })}
        </div>
      )}

      {answered && (
        <div className="flex flex-col gap-3 animate-fade-up">
          <p className={`text-center text-sm font-semibold ${correct ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
            {correct ? '✅ 认识！' : `还不认识没关系：${displayWord(word.word)} = ${word.definition}`}
          </p>
          <Button variant="hero" className="h-14 w-full text-base" onClick={next}>
            {index + 1 < questions.length ? '下一题 →' : '看结果 🎯'}
          </Button>
        </div>
      )}
    </div>
  )
}
