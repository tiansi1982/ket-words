import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { recorder } from '@/services/recorder'
import { useOnline } from '@/lib/use-online'
import { useSettings } from '@/lib/use-settings'
import { displayWord, spellingHint } from '@/lib/word-utils'
import { wordStatus } from '@/lib/word-status'
import { phasePlan, quizTypeFor, matchesGap } from '@/lib/exercise'
import SentenceSpeak, { ExampleSentence } from '@/components/SentenceSpeak'
import SessionSummary from '@/components/SessionSummary'
import DictationPrompt from '@/components/DictationPrompt'
import GapFillPrompt from '@/components/GapFillPrompt'
import { speakWordAndExample } from '@/lib/speak'
import { playSfx } from '@/lib/sfx'
import PageHeader from '@/components/PageHeader'
import ProgressBar from '@/components/ProgressBar'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import type { Word, WordProgress, SpeakOutcome } from '@/types'

// What this word is to the child right now — shown on the card so a due
// review doesn't look like a brand-new word (R8)
function wordKind(p: WordProgress | undefined): { label: string; cls: string } {
  if (!p || p.status === 'new') return { label: '新词', cls: 'text-sky-600 dark:text-sky-400' }
  if (p.status === 'mastered') return { label: '复习', cls: 'text-orange-500' }
  return { label: '学习中', cls: 'text-amber-600 dark:text-amber-400' }
}

function lastStudiedText(ts: number | undefined): string {
  if (!ts) return ''
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  return days <= 0 ? ' · 今天学过' : ` · 上次 ${days} 天前`
}

const hasSpeech = recorder.isSupported()

export default function Study() {
  const navigate = useNavigate()
  const {
    currentSession, progress, getTodayDate,
    updateProgress, recordSpeak, recordSessionResult, addToErrorBank, advanceSession, completeDailySession, pruneSession,
  } = useUserStore()
  const { getWord, checkSpelling } = useWordStore()
  const online = useOnline()
  const settings = useSettings()

  // A session saved before a word-list change may reference ids that no longer
  // exist; drop them (cursor preserved) instead of rendering an empty card with
  // no way forward. No-op when every id is known.
  const sessionWordIds = currentSession?.wordIds
  useEffect(() => {
    if (sessionWordIds) pruneSession((id) => getWord(id) !== undefined)
  }, [sessionWordIds, pruneSession, getWord])

  // Session cursor lives in the persisted store so leaving mid-session resumes here
  const index = currentSession?.currentIndex ?? 0
  const wordIds = currentSession?.wordIds ?? []
  const currentWord: Word | undefined = getWord(wordIds[index])
  const total = wordIds.length
  const finished = total > 0 && index >= total

  // The phase plan and quiz type are fixed when the word comes up: answering
  // changes its progress, which must not reshuffle the phases mid-word (F4)
  const wordId = currentWord?.id
  const { plan, quizType, review } = useMemo(() => {
    const p = wordId === undefined ? undefined : useUserStore.getState().progress[wordId]
    const review = wordStatus(p, getTodayDate()) === 'due'
    const word = wordId === undefined ? undefined : getWord(wordId)
    return { plan: phasePlan(review, hasSpeech), quizType: quizTypeFor(p, review, word), review }
  }, [wordId, getTodayDate, getWord])
  const [phaseIdx, setPhaseIdx] = useState(0)
  const phase = plan[Math.min(phaseIdx, plan.length - 1)]
  const [input, setInput] = useState('')
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)

  useEffect(() => {
    if (finished) completeDailySession()
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentWord && phase === 'show' && settings.autoSpeak) {
      speakWordAndExample(currentWord)
    }
  }, [currentWord, phase, settings.autoSpeak])

  const nextWord = () => {
    advanceSession()
    setPhaseIdx(0)
    setInput('')
    setLastCorrect(null)
  }
  const nextPhase = () => {
    if (phaseIdx + 1 < plan.length) setPhaseIdx(phaseIdx + 1)
    else nextWord()
  }
  const isLastWord = index + 1 >= total
  const lastPhase = phaseIdx + 1 >= plan.length

  // Skipped or scored below the bar: the word counts as missed so it lands in
  // the error bank and stays in the to-learn pool
  const handleSpeakDone = (outcome: SpeakOutcome, score: number | null) => {
    if (currentWord) {
      recordSpeak(currentWord.id, score, outcome === 'passed')
      recordSessionResult(currentWord.id, { speak: outcome, speakScore: score })
      if (outcome !== 'passed') {
        updateProgress(currentWord.id, false)
        addToErrorBank(currentWord.id)
      }
    }
    setInput('')
    nextPhase()
  }

  const handleSubmit = () => {
    if (!currentWord) return
    const correct = quizType === 'gap' ? matchesGap(input, currentWord) : checkSpelling(input, currentWord)
    setLastCorrect(correct)
    updateProgress(currentWord.id, correct)
    recordSessionResult(currentWord.id, { spelled: correct, quiz: quizType })
    if (!correct) addToErrorBank(currentWord.id)
    if (settings.sounds) void playSfx(correct ? 'correct' : 'wrong')
    if (settings.autoSpeak) speakWordAndExample(currentWord)
    nextPhase()
  }

  // Scoring needs the network and there's no offline mode — block until back online.
  // Session state is persisted, so returning later resumes at the same word.
  if (!online) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card flex flex-col items-center gap-4 rounded-[2rem] p-10 text-center animate-pop-in">
          <div className="text-5xl">📡</div>
          <p className="font-semibold">没有网络连接</p>
          <p className="text-sm text-muted-foreground">学习需要联网给发音打分，请连上网络后再继续。进度已保存。</p>
          <Button variant="hero" className="h-11 px-7" onClick={() => navigate('/')}>
            返回首页
          </Button>
        </div>
      </div>
    )
  }

  if (!currentSession || total === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card flex flex-col items-center gap-4 rounded-[2rem] p-10 text-center animate-pop-in">
          <p className="text-muted-foreground font-medium">没有学习内容</p>
          <Button variant="hero" className="h-11 px-7" onClick={() => navigate('/')}>
            返回首页
          </Button>
        </div>
      </div>
    )
  }

  if (finished) return <SessionSummary session={currentSession} />

  const continueLabel = lastPhase ? (isLastWord ? '完成学习 🎉' : '下一个 →') : plan[phaseIdx + 1] === 'speak' ? '练习发音 →' : '继续 →'
  const kind = currentWord ? wordKind(progress[currentWord.id]) : null
  const kindChip = currentWord && kind && (
    <div className="mb-4 flex justify-center">
      <span className={`glass-chip rounded-full px-2.5 py-0.5 text-xs font-semibold ${kind.cls}`}>
        {kind.label}
        {lastStudiedText(progress[currentWord.id]?.lastStudied)}
      </span>
    </div>
  )
  const spellHint = currentWord && (progress[currentWord.id]?.consecutiveWrong ?? 0) >= 2 && (
    <p className="glass-chip mx-auto mt-5 w-fit rounded-full px-4 py-1.5 text-sm font-medium font-mono tracking-widest text-orange-500">
      💡 {spellingHint(currentWord.word)}
    </p>
  )

  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <PageHeader counter={`${index + 1} / ${total}`} />
      <ProgressBar value={(index / total) * 100} className="mb-7 h-1.5" />

      {/* ── PHASE: show ── */}
      {phase === 'show' && currentWord && (
        <div className="flex flex-col gap-5 flex-1 animate-fade-up">
          <div className="glass-card flex w-full flex-1 flex-col justify-center rounded-[2rem] p-8 text-center">
            {kindChip}
            <div className="mb-2 flex items-center justify-center gap-3">
              <span className="text-[2.75rem] leading-tight font-extrabold tracking-tight">{displayWord(currentWord.word)}</span>
              <SpeakButton onClick={() => speakWordAndExample(currentWord)} className="h-10 w-10" iconClassName="h-5 w-5" />
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {currentWord.ipa && <span className="font-mono">{currentWord.ipa}</span>}
              <span className="glass-chip rounded-full px-2.5 py-0.5 text-xs font-medium">{currentWord.pos_cn}</span>
            </div>
            <div className="mt-7 border-t border-border/70 pt-7 text-left">
              <p className="text-center text-2xl font-bold tracking-tight">{currentWord.definition}</p>
              <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground italic">
                <ExampleSentence word={currentWord.word} example={currentWord.example} forms={currentWord.forms} />
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground/80">{currentWord.example_cn}</p>
            </div>
          </div>

          <Button variant="hero" className="h-14 w-full text-base" onClick={nextPhase}>
            {plan[phaseIdx + 1] === 'speak' ? '练习发音 →' : '开始拼写 →'}
          </Button>
        </div>
      )}

      {/* ── PHASE: speak ── */}
      {phase === 'speak' && currentWord && (
        <SentenceSpeak
          key={currentWord.id}
          word={currentWord}
          passScore={settings.passScore}
          continueLabel={lastPhase ? (isLastWord ? '完成学习 🎉' : '下一个 →') : '继续拼写 →'}
          skipLabel="跳过发音"
          onContinue={handleSpeakDone}
          onAbort={() => navigate('/')}
        />
      )}

      {/* ── PHASE: quiz ── */}
      {phase === 'quiz' && currentWord && (
        <div className="flex flex-col gap-5 flex-1 animate-fade-up">
          {quizType === 'dictation' ? (
            <DictationPrompt key={currentWord.id} word={currentWord}>
              {review && (
                <span className="text-xs text-orange-500">
                  复习{lastStudiedText(progress[currentWord.id]?.lastStudied)}
                </span>
              )}
              {spellHint}
            </DictationPrompt>
          ) : quizType === 'gap' ? (
            <GapFillPrompt key={currentWord.id} word={currentWord}>
              <span className="text-xs text-orange-500">
                复习{lastStudiedText(progress[currentWord.id]?.lastStudied)}
              </span>
              {spellHint}
            </GapFillPrompt>
          ) : (
            <div className="glass-card flex w-full flex-1 flex-col justify-center rounded-[2rem] p-8 text-center">
              {review && kindChip}
              <p className="mb-2 text-sm text-muted-foreground">{currentWord.pos_cn}</p>
              <p className="text-3xl font-extrabold tracking-tight">{currentWord.definition}</p>
              <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground italic">{currentWord.example_cn}</p>
              {spellHint}
            </div>
          )}

          <div className="w-full">
            <label className="mb-2.5 block text-center text-sm font-medium text-muted-foreground">
              {quizType === 'dictation' ? '把听到的单词拼出来' : quizType === 'gap' ? '填上空缺的单词' : '请拼写这个单词'}
            </label>
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && input.trim() && handleSubmit()}
              placeholder="输入英文单词..."
              className="glass-card h-16 w-full rounded-2xl px-4 text-center text-2xl font-medium font-mono tracking-widest outline-none transition-shadow placeholder:text-muted-foreground/50 focus:ring-3 focus:ring-primary/40"
            />
          </div>

          <Button variant="hero" className="h-14 w-full text-base" disabled={!input.trim()} onClick={handleSubmit}>
            提交答案
          </Button>
        </div>
      )}

      {/* ── PHASE: result ── */}
      {phase === 'result' && currentWord && (
        <div className="flex flex-col gap-5 flex-1 animate-fade-up">
          <div
            className={`flex w-full flex-1 flex-col justify-center gap-3 rounded-[2rem] border p-8 text-center backdrop-blur-xl ${
              lastCorrect
                ? 'border-green-500/30 bg-green-500/10 shadow-[0_12px_32px_-12px_rgb(34_197_94/0.25)]'
                : 'border-red-500/30 bg-red-500/10 shadow-[0_12px_32px_-12px_rgb(239_68_68/0.25)]'
            }`}
          >
            <div className="text-6xl animate-pop-in">{lastCorrect ? '✅' : '❌'}</div>
            <div className="mt-2 flex items-center justify-center gap-2.5">
              <span className="text-4xl font-extrabold tracking-tight">{displayWord(currentWord.word)}</span>
              <SpeakButton onClick={() => speakWordAndExample(currentWord)} />
            </div>
            {currentWord.ipa && <p className="font-mono text-sm text-muted-foreground">{currentWord.ipa}</p>}
            {!lastCorrect && (
              <p className="text-sm text-muted-foreground">
                你输入的是：<span className="font-mono font-semibold text-destructive">{input}</span>
              </p>
            )}
            <div className="mt-4 border-t border-current/10 pt-4 text-left">
              <p className="mb-2 text-center text-sm font-semibold">{currentWord.definition}</p>
              <p className="text-xs leading-relaxed text-muted-foreground italic">
                <ExampleSentence word={currentWord.word} example={currentWord.example} forms={currentWord.forms} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground/80">{currentWord.example_cn}</p>
            </div>
          </div>

          <Button variant="hero" className="h-14 w-full text-base" onClick={nextPhase}>
            {continueLabel}
          </Button>
        </div>
      )}
    </div>
  )
}
