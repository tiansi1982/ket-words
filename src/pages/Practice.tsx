import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { tts } from '@/services/tts'
import { baseWord, displayWord, shuffled } from '@/lib/word-utils'
import { buildWordOptions, buildDefinitionOptions, type DefinitionOption } from '@/lib/exercise'
import DictationPrompt from '@/components/DictationPrompt'
import PageHeader, { BackButton } from '@/components/PageHeader'
import ProgressBar from '@/components/ProgressBar'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import { RotateCcw, Shuffle, Languages, Headphones, ListChecks } from 'lucide-react'
import type { Word } from '@/types'

const BATCH = 10

// Question kinds (F4): the classic Chinese → pick the English word, the
// reverse, and dictation (hear → spell). "mixed" draws one per question.
type Kind = 'cn2en' | 'en2cn' | 'dictation'
type Mode = Kind | 'mixed'
const KINDS: Kind[] = ['cn2en', 'en2cn', 'dictation']
const MODES: { key: Mode; label: string; desc: string; icon: typeof Shuffle }[] = [
  { key: 'mixed', label: '混合', desc: '三种题型随机出', icon: Shuffle },
  { key: 'cn2en', label: '中 → 英', desc: '看中文，选单词', icon: ListChecks },
  { key: 'en2cn', label: '英 → 中', desc: '看单词，选意思', icon: Languages },
  { key: 'dictation', label: '听写', desc: '听发音，拼单词', icon: Headphones },
]
const MODE_KEY = 'ket-words-practice-mode'

function loadMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return MODES.some((m) => m.key === v) ? (v as Mode) : 'mixed'
  } catch {
    return 'mixed'
  }
}
function saveMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

interface Question {
  word: Word
  kind: Kind
  wordOptions?: Word[]
  defOptions?: DefinitionOption[]
}

function buildQuestions(words: Word[], pool: Word[], mode: Mode): Question[] {
  return words.map((word) => {
    const kind: Kind = mode === 'mixed' ? KINDS[Math.floor(Math.random() * KINDS.length)] : mode
    if (kind === 'cn2en') return { word, kind, wordOptions: buildWordOptions(word, pool) }
    if (kind === 'en2cn') return { word, kind, defOptions: buildDefinitionOptions(word, pool) }
    return { word, kind }
  })
}

const optionCls = (state: 'idle' | 'correct' | 'wrong' | 'dim') => {
  const base = 'rounded-2xl border p-4 text-center text-base font-semibold transition-all duration-200 '
  // No standalone backdrop-blur here: glass-card already supplies the blur,
  // and four simultaneously blurred tiles are expensive on low-end tablets
  if (state === 'idle') return base + 'glass-card cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg active:scale-[0.97]'
  if (state === 'correct') return base + 'border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-300 animate-pop-in'
  if (state === 'wrong') return base + 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-300 animate-pop-in'
  return base + 'border-border/60 bg-muted/40 text-muted-foreground opacity-60'
}

export default function Practice() {
  const navigate = useNavigate()
  const { progress, updateProgress, addToErrorBank } = useUserStore()
  const { words, checkSpelling } = useWordStore()

  const [mode, setMode] = useState<Mode>(loadMode)
  const [round, setRound] = useState(0) // 0 = start screen; bumps re-draw questions

  // Pick BATCH unmastered words (or any words if not enough); redrawn each round
  const questions = useMemo(() => {
    if (round === 0) return []
    const masteredIds = new Set(
      Object.values(progress)
        .filter((p) => p.status === 'mastered')
        .map((p) => p.wordId)
    )
    const pool = words.filter((w) => !masteredIds.has(w.id))
    const source = pool.length >= BATCH ? pool : words
    return buildQuestions(shuffled(source).slice(0, BATCH), words, mode)
  }, [round]) // eslint-disable-line react-hooks/exhaustive-deps

  const [index, setIndex] = useState(0)
  const [answered, setAnswered] = useState<{ correct: boolean; pick?: number } | null>(null)
  const [input, setInput] = useState('')
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const start = (m: Mode) => {
    setMode(m)
    saveMode(m)
    setRound((r) => r + 1)
    setIndex(0)
    setAnswered(null)
    setInput('')
    setScore(0)
    setDone(false)
  }

  const current = questions[index]

  const settle = (correct: boolean, pick?: number) => {
    if (answered || !current) return
    setAnswered({ correct, pick })
    if (correct) {
      setScore((s) => s + 1)
      updateProgress(current.word.id, true)
    } else {
      updateProgress(current.word.id, false)
      addToErrorBank(current.word.id)
    }
    if (current.kind !== 'dictation') tts.speak(baseWord(current.word.word))
  }

  const handleNext = () => {
    if (index + 1 >= questions.length) {
      setDone(true)
    } else {
      setIndex((i) => i + 1)
      setAnswered(null)
      setInput('')
    }
  }

  // ── start screen ──
  if (round === 0) {
    return (
      <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
        <div className="mb-7 flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-extrabold tracking-tight">混合练习</h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">每组 {BATCH} 题，从还没掌握的词里抽。答错会进错题本。</p>
        <div className="grid grid-cols-2 gap-3">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              aria-pressed={mode === m.key}
              className={`glass-card flex flex-col items-start gap-2 rounded-[1.5rem] p-4 text-left transition-all ${
                mode === m.key ? 'ring-3 ring-primary/50' : 'hover:-translate-y-0.5'
              }`}
            >
              <span className={`icon-tile h-9 w-9 rounded-xl ${mode === m.key ? 'bg-brand-gradient' : 'bg-linear-to-br from-slate-400 to-slate-600'}`}>
                <m.icon className="h-4 w-4" />
              </span>
              <span className="font-bold">{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.desc}</span>
            </button>
          ))}
        </div>
        <Button variant="hero" className="mt-6 h-14 w-full text-base" onClick={() => start(mode)}>
          开始 {BATCH} 题
        </Button>
      </div>
    )
  }

  if (questions.length === 0) {
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
    const pct = Math.round((score / questions.length) * 100)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-7xl animate-pop-in">{pct >= 80 ? '🏆' : pct >= 60 ? '👍' : '💪'}</div>
        <h2 className="text-3xl font-extrabold tracking-tight animate-fade-up">练习结束！</h2>
        <p className="text-muted-foreground text-lg animate-fade-up [animation-delay:80ms]">
          {questions.length} 题中答对 <span className="font-bold text-foreground tabular-nums">{score}</span> 题
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
        <div className="mt-2 flex flex-wrap justify-center gap-3 animate-fade-up [animation-delay:200ms]">
          <Button variant="glass" className="h-12 px-6" onClick={() => navigate('/')}>
            返回首页
          </Button>
          <Button variant="glass" className="h-12 px-6" onClick={() => setRound(0)}>
            换题型
          </Button>
          <Button variant="hero" className="h-12 gap-2 px-6" onClick={() => start(mode)}>
            <RotateCcw className="h-4 w-4" /> 再练一组
          </Button>
        </div>
      </div>
    )
  }

  const { word, kind } = current
  const correct = answered?.correct ?? false

  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <PageHeader counter={`${index + 1} / ${questions.length}`} />
      <ProgressBar value={(index / questions.length) * 100} className="mb-7 h-1.5" />

      {/* ── prompt ── */}
      {kind === 'cn2en' && (
        <div className="glass-card mb-5 rounded-[2rem] p-7 animate-fade-up">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{word.pos_cn} · 选出对应的单词</p>
          <p className="mb-4 text-2xl font-extrabold tracking-tight">{word.definition}</p>
          <p className="text-sm leading-relaxed text-muted-foreground italic">{word.example_cn}</p>
          {answered && (
            <div className="mt-5 flex items-center justify-center gap-2.5 border-t border-border/70 pt-5 animate-fade-up">
              <span className="text-3xl font-extrabold tracking-tight text-gradient">{displayWord(word.word)}</span>
              <SpeakButton onClick={() => tts.speak(baseWord(word.word))} label="朗读单词" />
            </div>
          )}
        </div>
      )}
      {kind === 'en2cn' && (
        <div className="glass-card mb-5 rounded-[2rem] p-7 text-center animate-fade-up">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{word.pos_cn} · 选出它的意思</p>
          <div className="flex items-center justify-center gap-2.5">
            <span className="text-3xl font-extrabold tracking-tight">{displayWord(word.word)}</span>
            <SpeakButton onClick={() => tts.speak(baseWord(word.word))} label="朗读单词" />
          </div>
          {word.ipa && <p className="mt-1 font-mono text-sm text-muted-foreground">{word.ipa}</p>}
          {answered && (
            <p className="mt-4 border-t border-border/70 pt-4 text-sm text-muted-foreground italic animate-fade-up">{word.example}</p>
          )}
        </div>
      )}
      {kind === 'dictation' && !answered && (
        <div className="mb-5 flex flex-col gap-5">
          <DictationPrompt key={word.id} word={word} />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && input.trim() && settle(checkSpelling(input, word))}
            placeholder="输入英文单词..."
            className="glass-card h-16 w-full rounded-2xl px-4 text-center text-2xl font-medium font-mono tracking-widest outline-none transition-shadow placeholder:text-muted-foreground/50 focus:ring-3 focus:ring-primary/40"
          />
          <Button variant="hero" className="h-14 w-full text-base" disabled={!input.trim()} onClick={() => settle(checkSpelling(input, word))}>
            提交答案
          </Button>
        </div>
      )}
      {kind === 'dictation' && answered && (
        <div
          className={`mb-5 rounded-[2rem] border p-7 text-center animate-fade-up ${
            correct ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'
          }`}
        >
          <div className="mb-2 text-4xl animate-pop-in">{correct ? '✅' : '❌'}</div>
          <div className="flex items-center justify-center gap-2.5">
            <span className="text-3xl font-extrabold tracking-tight">{displayWord(word.word)}</span>
            <SpeakButton onClick={() => tts.speak(baseWord(word.word))} label="朗读单词" />
          </div>
          {!correct && (
            <p className="mt-1 text-sm text-muted-foreground">
              你输入的是：<span className="font-mono font-semibold text-destructive">{input}</span>
            </p>
          )}
          <p className="mt-3 text-sm font-semibold">{word.definition}</p>
          <p className="mt-1 text-xs text-muted-foreground italic">{word.example}</p>
        </div>
      )}

      {/* ── options ── */}
      {kind === 'cn2en' && current.wordOptions && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          {current.wordOptions.map((opt) => {
            const state = !answered ? 'idle' : opt.id === word.id ? 'correct' : opt.id === answered.pick ? 'wrong' : 'dim'
            return (
              <button key={opt.id} className={optionCls(state)} onClick={() => settle(opt.id === word.id, opt.id)}>
                {displayWord(opt.word)}
              </button>
            )
          })}
        </div>
      )}
      {kind === 'en2cn' && current.defOptions && (
        <div className="mb-5 grid grid-cols-1 gap-3">
          {current.defOptions.map((opt) => {
            const state = !answered ? 'idle' : opt.wordId === word.id ? 'correct' : opt.wordId === answered.pick ? 'wrong' : 'dim'
            return (
              <button key={opt.wordId} className={optionCls(state)} onClick={() => settle(opt.wordId === word.id, opt.wordId)}>
                {opt.text}
              </button>
            )
          })}
        </div>
      )}

      {/* ── feedback + next ── */}
      {answered && (
        <div className="flex flex-col gap-3 animate-fade-up">
          <p className={`text-center font-semibold ${correct ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
            {correct
              ? '✅ 回答正确！'
              : kind === 'en2cn'
                ? `❌ 正确答案是 "${word.definition}"`
                : `❌ 正确答案是 "${displayWord(word.word)}"`}
          </p>
          <Button variant="hero" className="h-14 w-full text-base" onClick={handleNext}>
            {index + 1 < questions.length ? '下一题 →' : '查看成绩 🎉'}
          </Button>
        </div>
      )}
    </div>
  )
}
