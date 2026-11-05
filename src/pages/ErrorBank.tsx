import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { tts } from '@/services/tts'
import { recorder } from '@/services/recorder'
import { useOnline } from '@/lib/use-online'
import { useSettings } from '@/lib/use-settings'
import { baseWord, displayWord, spellingHint } from '@/lib/word-utils'
import { playSfx } from '@/lib/sfx'
import { resumePhase } from '@/lib/exercise'
import SentenceSpeak from '@/components/SentenceSpeak'
import PageHeader from '@/components/PageHeader'
import ProgressBar from '@/components/ProgressBar'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import { Trash2, RotateCcw } from 'lucide-react'
import type { SpeakOutcome } from '@/types'

// Error-bank practice round (R9). Mirrors the daily-study flow: read the
// sentence aloud first, then spell. A word leaves the bank only when both
// parts pass in the same round. The round (ERROR_BATCH words, repeat
// offenders first) lives in the store, so leaving mid-way resumes — down to
// the phase within a word, since answers are counted when given (R03).
type Phase = 'speak' | 'quiz' | 'result'

const hasSpeech = recorder.isSupported()
const PLAN: Phase[] = hasSpeech ? ['speak', 'quiz', 'result'] : ['quiz', 'result']

export default function ErrorBank() {
  const navigate = useNavigate()
  const {
    errorBank, errorSession, progress,
    updateProgress, recordSpeak, removeFromErrorBank,
    startErrorRound, advanceErrorRound, recordErrorResult, pruneErrorSession, endErrorRound,
  } = useUserStore()
  const { getWord, checkSpelling } = useWordStore()
  const online = useOnline()
  const settings = useSettings()

  const [input, setInput] = useState('')

  // On entry only: start a round if there is none, otherwise drop words that
  // left the bank meanwhile (cleared on another device) or vanished from the
  // dictionary — but keep words answered in this round, whose result card
  // may still be due. Not re-run on changes — answering correctly removes
  // the current word from the bank while its result card is still showing.
  useEffect(() => {
    const s = useUserStore.getState()
    if (!s.errorSession) {
      if (s.errorBank.length > 0) startErrorRound()
    } else if (s.errorSession.currentIndex < s.errorSession.wordIds.length) {
      const answered = s.errorSession.results ?? {}
      pruneErrorSession((id) => (s.errorBank.includes(id) || answered[id] !== undefined) && getWord(id) !== undefined)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const wordIds = errorSession?.wordIds ?? []
  const index = errorSession?.currentIndex ?? 0
  const total = wordIds.length
  const currentWord = getWord(wordIds[index])
  const finished = total > 0 && index >= total

  // What this word already got this round; the phase resumes after it and is
  // keyed by word, so the next word starts at its own resume point
  const wordId = currentWord?.id
  const answered = wordId === undefined ? undefined : errorSession?.results?.[wordId]
  const [phaseAt, setPhaseAt] = useState<{ wordId: number | undefined; phase: Phase } | null>(null)
  const phase: Phase = phaseAt && phaseAt.wordId === wordId ? phaseAt.phase : PLAN[resumePhase(PLAN, answered)]
  const setPhase = (p: Phase) => setPhaseAt({ wordId, phase: p })
  const lastCorrect = answered?.spelled ?? null
  const speakFailed = answered?.speak !== undefined && answered.speak !== 'passed'

  const resetCard = () => {
    setPhaseAt(null)
    setInput('')
  }

  // Scoring needs the network and there's no offline mode — block until back online
  if (!online) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card flex flex-col items-center gap-4 rounded-[2rem] p-10 text-center animate-pop-in">
          <div className="text-5xl">📡</div>
          <p className="font-semibold">没有网络连接</p>
          <p className="text-sm text-muted-foreground">错题练习需要联网给发音打分，请连上网络后再试。进度已保存。</p>
          <Button variant="hero" className="h-11 px-7" onClick={() => navigate('/error-bank')}>
            返回错题本
          </Button>
        </div>
      </div>
    )
  }

  if (!errorSession || total === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-6xl animate-pop-in">🌟</div>
        <h2 className="text-2xl font-extrabold tracking-tight animate-fade-up">错题本是空的！</h2>
        <p className="text-sm text-muted-foreground animate-fade-up [animation-delay:80ms]">继续加油，保持零错误</p>
        <Button variant="hero" className="mt-2 h-11 px-8 animate-fade-up [animation-delay:150ms]" onClick={() => navigate('/')}>
          返回首页
        </Button>
      </div>
    )
  }

  if (finished) {
    const cleared = errorSession.cleared.length
    const remaining = errorBank.length
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="text-6xl animate-pop-in">{cleared === total ? '🏆' : cleared > 0 ? '💪' : '🌱'}</div>
        <h2 className="text-3xl font-extrabold tracking-tight animate-fade-up">这轮练完了！</h2>
        <p className="text-muted-foreground tabular-nums animate-fade-up [animation-delay:80ms]">
          {total} 个里移出了 <span className="font-bold text-foreground">{cleared}</span> 个
          {remaining > 0 ? ` · 错题本还剩 ${remaining} 个` : ' · 错题本清空了 🎉'}
        </p>
        <div className="mt-2 flex gap-3 animate-fade-up [animation-delay:150ms]">
          <Button
            variant="glass"
            className="h-12 px-6"
            onClick={() => {
              endErrorRound()
              navigate('/error-bank')
            }}
          >
            返回错题本
          </Button>
          {remaining > 0 && (
            <Button
              variant="hero"
              className="h-12 gap-2 px-6"
              onClick={() => {
                endErrorRound()
                startErrorRound()
                resetCard()
              }}
            >
              <RotateCcw className="h-4 w-4" /> 再练一轮
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Unknown id until the entry effect prunes it — render nothing for a frame
  if (!currentWord) return null

  // Skipped or scored below the bar: the word counts as missed this round, so
  // the spelling that follows can no longer clear it out of the error bank.
  // Each part is counted once per round.
  const handleSpeakDone = (outcome: SpeakOutcome, score: number | null) => {
    if (answered?.speak === undefined) {
      recordSpeak(currentWord.id, score, outcome === 'passed')
      recordErrorResult(currentWord.id, { speak: outcome })
      if (outcome !== 'passed') updateProgress(currentWord.id, false)
    }
    setPhase('quiz')
  }

  const handleSubmit = () => {
    setPhase('result')
    if (answered?.spelled !== undefined) return
    const correct = checkSpelling(input, currentWord)
    recordErrorResult(currentWord.id, { spelled: correct })
    updateProgress(currentWord.id, correct)
    if (correct && !speakFailed) removeFromErrorBank(currentWord.id)
    if (settings.sounds) void playSfx(correct ? 'correct' : 'wrong')
    if (settings.autoSpeak) tts.speakAll([baseWord(currentWord.word), currentWord.example])
  }

  const handleNext = (cleared: boolean) => {
    advanceErrorRound(cleared)
    resetCard()
  }

  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <PageHeader counter={`错题练习 ${index + 1}/${total}`} />
      <ProgressBar
        value={(index / total) * 100}
        className="mb-7 h-1.5"
        barClassName="bg-gradient-to-r from-red-400 to-rose-500 duration-300"
      />

      {phase === 'speak' && (
        <SentenceSpeak
          key={currentWord.id}
          word={currentWord}
          passScore={settings.passScore}
          continueLabel="继续拼写 →"
          skipLabel="跳过跟读"
          onContinue={handleSpeakDone}
          onAbort={() => navigate('/')}
        />
      )}

      {phase === 'quiz' && (
        <div className="flex flex-col gap-5 flex-1 animate-fade-up">
          <div className="glass-card w-full rounded-[2rem] p-8 text-center">
            <p className="mb-2 text-sm text-muted-foreground">{currentWord.pos_cn}</p>
            <p className="text-3xl font-extrabold tracking-tight">{currentWord.definition}</p>
            <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground italic">{currentWord.example_cn}</p>
            {(progress[currentWord.id]?.consecutiveWrong ?? 0) >= 2 && (
              <p className="glass-chip mx-auto mt-5 w-fit rounded-full px-4 py-1.5 font-mono text-sm font-medium tracking-widest text-orange-500">
                💡 {spellingHint(currentWord.word)}
              </p>
            )}
          </div>

          <div className="w-full">
            <label className="mb-2.5 block text-center text-sm font-medium text-muted-foreground">拼写这个单词：</label>
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && input.trim() && handleSubmit()}
              placeholder="输入英文单词..."
              className="glass-card h-16 w-full rounded-2xl px-4 text-center text-2xl font-medium font-mono tracking-widest outline-none transition-shadow placeholder:text-muted-foreground/50 focus:ring-3 focus:ring-primary/40"
            />
          </div>

          <Button variant="hero" className="mt-auto h-14 w-full text-base" disabled={!input.trim()} onClick={handleSubmit}>
            提交答案
          </Button>
        </div>
      )}

      {phase === 'result' && (
        <div className="flex flex-col gap-5 flex-1 animate-fade-up">
          <div
            className={`w-full rounded-[2rem] border p-8 text-center backdrop-blur-xl ${
              lastCorrect
                ? 'border-green-500/30 bg-green-500/10 shadow-[0_12px_32px_-12px_rgb(34_197_94/0.25)]'
                : 'border-red-500/30 bg-red-500/10 shadow-[0_12px_32px_-12px_rgb(239_68_68/0.25)]'
            }`}
          >
            <div className="mb-3 text-5xl animate-pop-in">{lastCorrect ? '✅' : '❌'}</div>
            <div className="flex items-center justify-center gap-2.5">
              <span className="text-4xl font-extrabold tracking-tight">{displayWord(currentWord.word)}</span>
              <SpeakButton onClick={() => tts.speakAll([baseWord(currentWord.word), currentWord.example])} />
            </div>
            {lastCorrect && !speakFailed && (
              <p className="mt-2.5 text-sm font-semibold text-green-600 dark:text-green-400">已从错题本移除 ✓</p>
            )}
            {lastCorrect && speakFailed && (
              <p className="mt-2.5 text-sm font-semibold text-amber-600 dark:text-amber-400">拼写正确，但跟读没过关，仍留在错题本</p>
            )}
            {!lastCorrect && input && (
              <p className="mt-2.5 text-sm text-muted-foreground">
                你输入的是：<span className="font-mono font-semibold text-destructive">{input}</span>
              </p>
            )}
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground italic">{currentWord.example}</p>
          </div>

          <div className="mt-auto flex gap-3">
            {!(lastCorrect && !speakFailed) && (
              <Button
                variant="glass"
                className="h-13 flex-1 gap-1.5 text-destructive"
                onClick={() => {
                  removeFromErrorBank(currentWord.id)
                  handleNext(true)
                }}
              >
                <Trash2 className="h-4 w-4" /> 删除错题
              </Button>
            )}
            <Button variant="hero" className="h-13 flex-1" onClick={() => handleNext(!!lastCorrect && !speakFailed)}>
              {index + 1 < total ? '下一个 →' : '看看结果 🎉'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
