import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { tts } from '@/services/tts'
import { Button } from '@/components/ui/button'
import { Volume2, ChevronLeft, Trash2 } from 'lucide-react'
import type { Word } from '@/types'

type Phase = 'quiz' | 'result'

export default function ErrorBank() {
  const navigate = useNavigate()
  const { errorBank, updateProgress, removeFromErrorBank } = useUserStore()
  const { getErrorWords } = useWordStore()

  const words: Word[] = getErrorWords(errorBank)
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('quiz')
  const [input, setInput] = useState('')
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)

  if (words.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-5xl">🌟</div>
        <h2 className="text-xl font-bold">错题本是空的！</h2>
        <p className="text-muted-foreground text-sm">继续加油，保持零错误</p>
        <Button className="rounded-2xl" onClick={() => navigate('/')}>返回首页</Button>
      </div>
    )
  }

  if (index >= words.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-5xl">💪</div>
        <h2 className="text-2xl font-bold">错题练习完成！</h2>
        <Button className="rounded-2xl h-12 px-8" onClick={() => navigate('/')}>
          返回首页
        </Button>
      </div>
    )
  }

  const currentWord = words[index]

  const handleSubmit = () => {
    if (!currentWord) return
    const correct = input.trim().toLowerCase() === currentWord.word.toLowerCase()
    setLastCorrect(correct)
    setPhase('result')
    updateProgress(currentWord.id, correct)
    if (correct) removeFromErrorBank(currentWord.id)
    tts.speak(currentWord.word)
  }

  const handleNext = () => {
    setIndex((i) => i + 1)
    setPhase('quiz')
    setInput('')
    setLastCorrect(null)
  }

  return (
    <div className="min-h-screen flex flex-col px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium">错题练习 {index + 1}/{words.length}</span>
        <div className="w-10" />
      </div>

      <div className="w-full bg-muted rounded-full h-2 mb-8">
        <div
          className="bg-destructive h-2 rounded-full transition-all duration-300"
          style={{ width: `${(index / words.length) * 100}%` }}
        />
      </div>

      {phase === 'quiz' && currentWord && (
        <div className="flex flex-col gap-6 flex-1">
          <div className="bg-card border rounded-3xl p-8 w-full text-center shadow-sm">
            <p className="text-muted-foreground text-sm mb-1">{currentWord.pos_cn}</p>
            <p className="text-2xl font-bold">{currentWord.definition}</p>
            <p className="mt-4 text-sm text-muted-foreground italic">{currentWord.example_cn}</p>
          </div>

          <div className="w-full">
            <label className="text-sm text-muted-foreground mb-2 block">拼写这个单词：</label>
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && input.trim() && handleSubmit()}
              placeholder="输入英文单词..."
              className="w-full border rounded-2xl px-4 py-4 text-lg text-center bg-background outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <Button
            className="w-full h-14 text-base rounded-2xl mt-auto"
            disabled={!input.trim()}
            onClick={handleSubmit}
          >
            提交答案
          </Button>
        </div>
      )}

      {phase === 'result' && currentWord && (
        <div className="flex flex-col gap-6 flex-1">
          <div className={`border rounded-3xl p-8 w-full text-center shadow-sm ${
            lastCorrect ? 'bg-green-50 border-green-200 dark:bg-green-950/20' : 'bg-red-50 border-red-200 dark:bg-red-950/20'
          }`}>
            <div className="text-4xl mb-3">{lastCorrect ? '✅' : '❌'}</div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-3xl font-bold">{currentWord.word}</span>
              <button onClick={() => tts.speak(currentWord.word)} className="text-muted-foreground">
                <Volume2 className="h-5 w-5" />
              </button>
            </div>
            {lastCorrect && (
              <p className="mt-2 text-sm text-green-600 dark:text-green-400">已从错题本移除 ✓</p>
            )}
            {!lastCorrect && (
              <p className="mt-2 text-sm text-muted-foreground">你输入的是：<span className="text-destructive">{input}</span></p>
            )}
            <p className="mt-4 text-sm italic text-muted-foreground">{currentWord.example}</p>
          </div>

          <div className="flex gap-3 mt-auto">
            <Button
              variant="outline"
              className="flex-1 h-12 rounded-2xl text-destructive border-destructive/30"
              onClick={() => { removeFromErrorBank(currentWord.id); handleNext() }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> 删除错题
            </Button>
            <Button className="flex-1 h-12 rounded-2xl" onClick={handleNext}>
              {index + 1 < words.length ? '下一个 →' : '完成 🎉'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
