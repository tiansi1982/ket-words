import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore, orderErrorBank, ERROR_BATCH } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { useOnline } from '@/lib/use-online'
import { displayWord } from '@/lib/word-utils'
import { speakWordAndExample } from '@/lib/speak'
import { BackButton } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Trash2, Volume2, Play, Zap } from 'lucide-react'

// Error bank as a list (R9): browse, listen, remove by hand, and start or
// resume a practice round of ERROR_BATCH words (repeat offenders first).
export default function ErrorList() {
  const navigate = useNavigate()
  const { errorBank, errorSession, progress, removeFromErrorBank } = useUserStore()
  const { getErrorWords } = useWordStore()
  const online = useOnline()
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const words = getErrorWords(orderErrorBank(errorBank, progress))
  const inProgress =
    errorSession && errorSession.currentIndex < errorSession.wordIds.length ? errorSession : null
  const nextBatch = Math.min(ERROR_BATCH, words.length)

  if (words.length === 0) {
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

  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <div className="mb-6 flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-extrabold tracking-tight">错题本</h1>
        <span className="glass-chip ml-auto rounded-full px-3 py-1 text-sm font-semibold tabular-nums text-destructive">
          {words.length} 个
        </span>
      </div>

      <div className="glass-card mb-4 flex items-center gap-3.5 rounded-[1.4rem] p-4 animate-fade-up">
        <span className="icon-tile h-10 w-10 shrink-0 rounded-[0.85rem] bg-linear-to-br from-orange-400 to-red-500">
          <Zap className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold tabular-nums">
            {inProgress
              ? `上一轮还没练完（${inProgress.currentIndex}/${inProgress.wordIds.length}）`
              : `每轮 ${ERROR_BATCH} 个，连错多的先练`}
          </div>
          <p className="text-xs text-muted-foreground">
            {online ? '跟读过关 + 拼写正确才会移出错题本' : '练习需要联网给发音打分'}
          </p>
        </div>
        <Button
          variant="hero"
          className="h-10 shrink-0 gap-1.5 px-4"
          disabled={!online}
          onClick={() => navigate('/error-bank/practice')}
        >
          <Play className="h-4 w-4" />
          {inProgress ? '继续' : `练 ${nextBatch} 个`}
        </Button>
      </div>

      <div className="glass-card flex flex-col divide-y divide-border/60 rounded-[1.75rem] px-2 py-1 animate-fade-up [animation-delay:80ms]">
        {words.map((w) => {
          const p = progress[w.id]
          const wrong = p?.consecutiveWrong ?? 0
          const speakFails = p?.speakFailCount ?? 0
          return (
            <div key={w.id} className="flex items-center gap-2 py-1">
              <button
                onClick={() => speakWordAndExample(w)}
                aria-label={`朗读 ${displayWord(w.word)}`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-muted/60 active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold tracking-tight">{displayWord(w.word)}</span>
                    {wrong >= 2 && (
                      <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-300 tabular-nums">
                        连错 {wrong}
                      </span>
                    )}
                    {speakFails > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
                        🎤 没过 {speakFails}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{w.definition}</div>
                </div>
                <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              </button>
              {confirmId === w.id ? (
                <button
                  onClick={() => {
                    removeFromErrorBank(w.id)
                    setConfirmId(null)
                  }}
                  className="shrink-0 rounded-full bg-destructive px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-transform active:scale-95"
                >
                  确认移除
                </button>
              ) : (
                <button
                  onClick={() => setConfirmId(w.id)}
                  aria-label={`移除 ${displayWord(w.word)}`}
                  className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
