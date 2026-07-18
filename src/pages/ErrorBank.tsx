import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { tts } from '@/services/tts'
import { speechAssessment } from '@/services/speechAssessment'
import { baseWord, spellingHint } from '@/lib/word-utils'
import SentenceSpeak from '@/components/SentenceSpeak'
import PageHeader from '@/components/PageHeader'
import ProgressBar from '@/components/ProgressBar'
import SpeakButton from '@/components/SpeakButton'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import type { Word } from '@/types'

type Phase = 'quiz' | 'result' | 'speak'

const hasSpeech = speechAssessment.isSupported()

export default function ErrorBank() {
  const navigate = useNavigate()
  const { errorBank, progress, updateProgress, removeFromErrorBank } = useUserStore()
  const { getErrorWords, checkSpelling } = useWordStore()

  // Snapshot at mount: answering correctly removes words from errorBank in the
  // store, and a live-derived list would shift under the current index
  const [words] = useState<Word[]>(() => getErrorWords(errorBank))
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('quiz')
  const [input, setInput] = useState('')
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)

  if (words.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-6xl animate-pop-in">🌟</div>
        <h2 className="text-2xl font-extrabold tracking-tight animate-fade-up">错题本是空的！</h2>
        <p className="text-sm text-muted-foreground animate-fade-up [animation-delay:80ms]">继续加油，保持零错误</p>
        <Button
          variant="hero"
          className="mt-2 h-11 px-8 animate-fade-up [animation-delay:150ms]"
          onClick={() => navigate('/')}
        >
          返回首页
        </Button>
      </div>
    )
  }

  if (index >= words.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-6xl animate-pop-in">💪</div>
        <h2 className="text-3xl font-extrabold tracking-tight animate-fade-up">错题练习完成！</h2>
        <Button
          variant="hero"
          className="mt-2 h-13 px-9 text-base animate-fade-up [animation-delay:120ms]"
          onClick={() => navigate('/')}
        >
          返回首页
        </Button>
      </div>
    )
  }

  const currentWord = words[index]

  const handleSubmit = () => {
    if (!currentWord) return
    const correct = checkSpelling(input, currentWord)
    setLastCorrect(correct)
    setPhase('result')
    updateProgress(currentWord.id, correct)
    if (correct) removeFromErrorBank(currentWord.id)
    tts.speakAll([baseWord(currentWord.word), currentWord.example])
  }

  const handleNext = () => {
    setIndex((i) => i + 1)
    setPhase('quiz')
    setInput('')
    setLastCorrect(null)
  }

  // After the result, practice reading the sentence aloud (when supported)
  const handleAfterResult = () => {
    if (hasSpeech) {
      tts.stop()
      setPhase('speak')
    } else {
      handleNext()
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <PageHeader counter={`错题练习 ${index + 1}/${words.length}`} />
      <ProgressBar
        value={(index / words.length) * 100}
        className="mb-7 h-1.5"
        barClassName="bg-gradient-to-r from-red-400 to-rose-500 duration-300"
      />

      {phase === 'quiz' && currentWord && (
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

      {phase === 'result' && currentWord && (
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
              <span className="text-4xl font-extrabold tracking-tight">{currentWord.word}</span>
              <SpeakButton onClick={() => tts.speakAll([baseWord(currentWord.word), currentWord.example])} />
            </div>
            {lastCorrect && (
              <p className="mt-2.5 text-sm font-semibold text-green-600 dark:text-green-400">已从错题本移除 ✓</p>
            )}
            {!lastCorrect && (
              <p className="mt-2.5 text-sm text-muted-foreground">
                你输入的是：<span className="font-mono font-semibold text-destructive">{input}</span>
              </p>
            )}
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground italic">{currentWord.example}</p>
          </div>

          <div className="mt-auto flex gap-3">
            <Button
              variant="glass"
              className="h-13 flex-1 gap-1.5 text-destructive"
              onClick={() => { removeFromErrorBank(currentWord.id); handleNext() }}
            >
              <Trash2 className="h-4 w-4" /> 删除错题
            </Button>
            <Button variant="hero" className="h-13 flex-1" onClick={handleAfterResult}>
              {hasSpeech ? '跟读句子 →' : index + 1 < words.length ? '下一个 →' : '完成 🎉'}
            </Button>
          </div>
        </div>
      )}

      {phase === 'speak' && currentWord && (
        <SentenceSpeak
          key={currentWord.id}
          word={currentWord}
          continueLabel={index + 1 < words.length ? '下一个 →' : '完成 🎉'}
          skipLabel="跳过跟读"
          onContinue={handleNext}
        />
      )}
    </div>
  )
}
