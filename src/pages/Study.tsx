import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { speechAssessment } from '@/services/speechAssessment'
import { spellingHint } from '@/lib/word-utils'
import { Button } from '@/components/ui/button'
import SentenceSpeak, { ExampleSentence, speakWordAndExample } from '@/components/SentenceSpeak'
import { Volume2, ChevronLeft } from 'lucide-react'
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">没有学习内容</p>
          <Button onClick={() => navigate('/')}>返回首页</Button>
        </div>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold">今日学习完成！</h2>
        <p className="text-muted-foreground">共学习了 {total} 个单词</p>
        <Button className="rounded-2xl h-12 px-8" onClick={() => navigate('/')}>返回首页</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm text-muted-foreground font-medium">{index + 1} / {total}</span>
        <div className="w-10" />
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2 mb-6">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-500"
          style={{ width: `${(index / total) * 100}%` }}
        />
      </div>

      {/* ── PHASE: show ── */}
      {phase === 'show' && currentWord && (
        <div className="flex flex-col gap-5 flex-1">
          <div className="bg-card border rounded-3xl p-8 w-full text-center shadow-sm flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-center gap-3 mb-1">
              <span className="text-4xl font-bold tracking-tight">{currentWord.word}</span>
              <button onClick={() => speakWordAndExample(currentWord)} className="text-muted-foreground hover:text-primary transition-colors">
                <Volume2 className="h-6 w-6" />
              </button>
            </div>
            <span className="text-sm text-muted-foreground">
              {currentWord.ipa && <span className="font-mono mr-2">{currentWord.ipa}</span>}
              {currentWord.pos_cn}
            </span>
            <div className="mt-6 pt-6 border-t text-left">
              <p className="text-xl font-semibold text-center">{currentWord.definition}</p>
              <p className="mt-5 text-muted-foreground italic text-sm leading-relaxed">
                <ExampleSentence word={currentWord.word} example={currentWord.example} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{currentWord.example_cn}</p>
            </div>
          </div>

          <Button
            className="w-full h-14 text-base rounded-2xl"
            onClick={() => hasSpeech ? setPhase('speak') : goToQuiz()}
          >
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
        <div className="flex flex-col gap-5 flex-1">
          <div className="bg-card border rounded-3xl p-8 w-full text-center shadow-sm flex-1 flex flex-col justify-center">
            <p className="text-muted-foreground text-sm mb-2">{currentWord.pos_cn}</p>
            <p className="text-2xl font-bold">{currentWord.definition}</p>
            <p className="mt-5 text-muted-foreground italic text-sm leading-relaxed">{currentWord.example_cn}</p>
            {(progress[currentWord.id]?.consecutiveWrong ?? 0) >= 2 && (
              <p className="mt-4 text-sm text-orange-500 font-mono tracking-widest">
                💡 {spellingHint(currentWord.word)}
              </p>
            )}
          </div>

          <div className="w-full">
            <label className="text-sm text-muted-foreground mb-2 block text-center">请拼写这个单词</label>
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && input.trim() && handleSubmit()}
              placeholder="输入英文单词..."
              className="w-full border rounded-2xl px-4 py-4 text-xl text-center bg-background outline-none focus:ring-2 focus:ring-primary font-mono tracking-widest"
            />
          </div>

          <Button className="w-full h-14 text-base rounded-2xl" disabled={!input.trim()} onClick={handleSubmit}>
            提交答案
          </Button>
        </div>
      )}

      {/* ── PHASE: result ── */}
      {phase === 'result' && currentWord && (
        <div className="flex flex-col gap-5 flex-1">
          <div className={`border rounded-3xl p-8 w-full text-center shadow-sm flex-1 flex flex-col justify-center gap-3 ${
            lastCorrect
              ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
              : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
          }`}>
            <div className="text-5xl">{lastCorrect ? '✅' : '❌'}</div>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-3xl font-bold">{currentWord.word}</span>
              <button onClick={() => speakWordAndExample(currentWord)} className="text-muted-foreground hover:text-primary">
                <Volume2 className="h-5 w-5" />
              </button>
            </div>
            {currentWord.ipa && (
              <p className="text-sm text-muted-foreground font-mono">{currentWord.ipa}</p>
            )}
            {!lastCorrect && (
              <p className="text-sm text-muted-foreground">
                你输入的是：<span className="text-destructive font-mono">{input}</span>
              </p>
            )}
            <div className="mt-4 pt-4 border-t border-current/10 text-left">
              <p className="text-sm font-medium text-center mb-2">{currentWord.definition}</p>
              <p className="text-xs italic text-muted-foreground leading-relaxed">
                <ExampleSentence word={currentWord.word} example={currentWord.example} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">{currentWord.example_cn}</p>
            </div>
          </div>

          <Button className="w-full h-14 text-base rounded-2xl" onClick={handleNext}>
            {index + 1 < total ? '下一个 →' : '完成学习 🎉'}
          </Button>
        </div>
      )}
    </div>
  )
}
