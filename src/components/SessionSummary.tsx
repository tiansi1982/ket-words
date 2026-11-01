import { useNavigate } from 'react-router-dom'
import { useUserStore, toDateStr } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { displayWord } from '@/lib/word-utils'
import { speakWordAndExample } from '@/lib/speak'
import { Button } from '@/components/ui/button'
import { Volume2, Check, X, CalendarClock } from 'lucide-react'
import type { DailySession, SpeakOutcome } from '@/types'

function SpeakChip({ outcome, score }: { outcome: SpeakOutcome; score?: number | null }) {
  if (outcome === 'skipped' || score === null || score === undefined) {
    return (
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        跳过跟读
      </span>
    )
  }
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
        outcome === 'passed'
          ? 'bg-green-500/15 text-green-700 dark:text-green-300'
          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
      }`}
    >
      🎤 {score}分
    </span>
  )
}

// End-of-session recap (R7): how each word went (spelling + read-aloud),
// tap a row to hear it again, and what tomorrow holds. Sessions saved before
// results existed just list the words.
export default function SessionSummary({ session }: { session: DailySession }) {
  const navigate = useNavigate()
  const { getWord } = useWordStore()
  const progress = useUserStore((s) => s.progress)

  const rows = session.wordIds.flatMap((id) => {
    const word = getWord(id)
    return word ? [{ word, r: session.results?.[id] }] : []
  })
  const spelledOk = rows.filter((x) => x.r?.spelled === true).length
  const spokeOk = rows.filter((x) => x.r?.speak === 'passed').length
  const hasSpeak = rows.some((x) => x.r?.speak !== undefined)
  const missed = rows.filter(
    (x) => x.r && (x.r.spelled === false || (x.r.speak !== undefined && x.r.speak !== 'passed'))
  ).length

  // Reviews that will be waiting tomorrow: anything due by then that hasn't graduated
  const t = new Date()
  t.setDate(t.getDate() + 1)
  const tomorrow = toDateStr(t)
  const dueTomorrow = Object.values(progress).filter(
    (p) => p.status === 'mastered' && p.dueDate !== null && (p.dueDate === undefined || p.dueDate <= tomorrow)
  ).length

  return (
    <div className="min-h-screen flex flex-col px-5 py-8 max-w-lg mx-auto w-full">
      <div className="flex flex-col items-center text-center">
        <div className="text-6xl animate-pop-in">🎉</div>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight animate-fade-up">今日学习完成！</h2>
        <p className="mt-2 text-sm text-muted-foreground tabular-nums animate-fade-up [animation-delay:80ms]">
          共 {rows.length} 个单词 · 拼写对 {spelledOk} 个
          {hasSpeak && ` · 跟读过关 ${spokeOk} 个`}
        </p>
      </div>

      <div className="glass-card mt-6 flex items-center gap-3.5 rounded-[1.4rem] p-4 animate-fade-up [animation-delay:140ms]">
        <span className="icon-tile h-10 w-10 shrink-0 rounded-[0.85rem] bg-linear-to-br from-orange-400 to-orange-600">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div className="min-w-0 text-sm">
          {dueTomorrow > 0 ? (
            <>
              <div className="font-semibold tabular-nums">明天待复习 {dueTomorrow} 个</div>
              <p className="text-xs text-muted-foreground">复习词会优先排进明天的学习，记得回来</p>
            </>
          ) : (
            <>
              <div className="font-semibold">明天没有到期的复习</div>
              <p className="text-xs text-muted-foreground">明天会是一批新词</p>
            </>
          )}
          {missed > 0 && <p className="text-xs text-muted-foreground tabular-nums">今天有 {missed} 个词进了错题本</p>}
        </div>
      </div>

      <div className="glass-card mt-4 flex flex-col divide-y divide-border/60 rounded-[1.75rem] px-2 py-1 animate-fade-up [animation-delay:200ms]">
        {rows.map(({ word, r }) => (
          <button
            key={word.id}
            onClick={() => speakWordAndExample(word)}
            aria-label={`朗读 ${displayWord(word.word)}`}
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60 active:scale-[0.99]"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold tracking-tight">{displayWord(word.word)}</div>
              <div className="truncate text-xs text-muted-foreground">{word.definition}</div>
            </div>
            {r?.speak !== undefined && <SpeakChip outcome={r.speak} score={r.speakScore} />}
            {r?.spelled !== undefined &&
              (r.spelled ? (
                <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-label="拼写正确" />
              ) : (
                <X className="h-4 w-4 shrink-0 text-red-500" aria-label="拼写错误" />
              ))}
            <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground/50" />
          </button>
        ))}
      </div>

      <Button
        variant="hero"
        className="mt-6 h-13 w-full text-base animate-fade-up [animation-delay:260ms]"
        onClick={() => navigate('/')}
      >
        返回首页
      </Button>
    </div>
  )
}
