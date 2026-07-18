import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { speechAssessment } from '@/services/speechAssessment'
import { spellingHint } from '@/lib/word-utils'
import SentenceSpeak, { ExampleSentence, speakWordAndExample } from '@/components/SentenceSpeak'
import PageHeader from '@/components/PageHeader'
import ProgressBar from '@/components/ProgressBar'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import type { Word } from '@/types'

type Phase = 'show' | 'speak' | 'quiz' | 'result'

const hasSpeech = speechAssessment.isSupported()

export default function Study() {
  const navigate = useNavigate()
  const { currentSession, progress, updateProgress, addToErrorBank, advanceSession, completeDailySession } = useUserStore()
  const { getWord, checkSpelling } = useWordStore()

  // Session cursor lives in the persisted store so leaving mid-session resumes here
  const index = currentSession?.currentIndex ?? 0
  const [phase, setPhase] = useState<Phase>('show')
  const [input, setInput] = useState('')
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)

  const wordIds = currentSession?.wordIds ?? []
  const currentWord: Word | undefined = getWord(wordIds[index])
  const total = wordIds.length
  const finished = total > 0 && index >= total

  useEffect(() => {
    if (finished) completeDailySession()
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentWord && phase === 'show') {
      speakWordAndExample(currentWord)
    }
  }, [currentWord, phase])

  const goToQuiz = () => {
    setPhase('quiz')
    setInput('')
  }

  const handleSubmit = () => {
    if (!currentWord) return
    const correct = checkSpelling(input, currentWord)
    setLastCorrect(correct)
    setPhase('result')
    updateProgress(currentWord.id, correct)
    if (!correct) addToErrorBank(currentWord.id)
    speakWordAndExample(currentWord)
  }

  const handleNext = () => {
    advanceSession()
    setPhase('show')
    setInput('')
    setLastCorrect(null)
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

  if (finished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-7xl animate-pop-in">🎉</div>
        <h2 className="text-3xl font-extrabold tracking-tight animate-fade-up">今日学习完成！</h2>
        <p className="text-muted-foreground animate-fade-up [animation-delay:80ms]">共学习了 {total} 个单词</p>
        <Button
          variant="hero"
          className="mt-2 h-13 px-9 text-base animate-fade-up [animation-delay:150ms]"
          onClick={() => navigate('/')}
        >
          返回首页
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <PageHeader counter={`${index + 1} / ${total}`} />
      <ProgressBar value={(index / total) * 100} className="mb-7 h-1.5" />

      {/* ── PHASE: show ── */}
      {phase === 'show' && currentWord && (
        <div className="flex flex-col gap-5 flex-1 animate-fade-up">
          <div className="glass-card flex w-full flex-1 flex-col justify-center rounded-[2rem] p-8 text-center">
            <div className="mb-2 flex items-center justify-center gap-3">
              <span className="text-[2.75rem] leading-tight font-extrabold tracking-tight">{currentWord.word}</span>
              <SpeakButton onClick={() => speakWordAndExample(currentWord)} className="h-10 w-10" iconClassName="h-5 w-5" />
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {currentWord.ipa && <span className="font-mono">{currentWord.ipa}</span>}
              <span className="glass-chip rounded-full px-2.5 py-0.5 text-xs font-medium">{currentWord.pos_cn}</span>
            </div>
            <div className="mt-7 border-t border-border/70 pt-7 text-left">
              <p className="text-center text-2xl font-bold tracking-tight">{currentWord.definition}</p>
              <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground italic">
                <ExampleSentence word={currentWord.word} example={currentWord.example} />
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground/80">{currentWord.example_cn}</p>
            </div>
          </div>

          <Button variant="hero" className="h-14 w-full text-base" onClick={() => (hasSpeech ? setPhase('speak') : goToQuiz())}>
            {hasSpeech ? '练习发音 →' : '开始拼写 →'}
          </Button>
        </div>
      )}

      {/* ── PHASE: speak ── */}
      {phase === 'speak' && currentWord && (
        <SentenceSpeak
          key={currentWord.id}
          word={currentWord}
          continueLabel="继续拼写 →"
          skipLabel="跳过发音"
          onContinue={goToQuiz}
        />
      )}

      {/* ── PHASE: quiz ── */}
      {phase === 'quiz' && currentWord && (
        <div className="flex flex-col gap-5 flex-1 animate-fade-up">
          <div className="glass-card flex w-full flex-1 flex-col justify-center rounded-[2rem] p-8 text-center">
            <p className="mb-2 text-sm text-muted-foreground">{currentWord.pos_cn}</p>
            <p className="text-3xl font-extrabold tracking-tight">{currentWord.definition}</p>
            <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground italic">{currentWord.example_cn}</p>
            {(progress[currentWord.id]?.consecutiveWrong ?? 0) >= 2 && (
              <p className="glass-chip mx-auto mt-5 rounded-full px-4 py-1.5 text-sm font-medium font-mono tracking-widest text-orange-500">
                💡 {spellingHint(currentWord.word)}
              </p>
            )}
          </div>

          <div className="w-full">
            <label className="mb-2.5 block text-center text-sm font-medium text-muted-foreground">请拼写这个单词</label>
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
              <span className="text-4xl font-extrabold tracking-tight">{currentWord.word}</span>
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
                <ExampleSentence word={currentWord.word} example={currentWord.example} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground/80">{currentWord.example_cn}</p>
            </div>
          </div>

          <Button variant="hero" className="h-14 w-full text-base" onClick={handleNext}>
            {index + 1 < total ? '下一个 →' : '完成学习 🎉'}
          </Button>
        </div>
      )}
    </div>
  )
}
