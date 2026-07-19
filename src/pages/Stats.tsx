import { useMemo } from 'react'
import { useUserStore, toDateStr } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { difficultyOf, type Difficulty } from '@/lib/word-utils'
import { pct } from '@/lib/utils'
import { BackButton } from '@/components/PageHeader'
import ProgressBar from '@/components/ProgressBar'
import { CircleCheck, BookOpen, Clock, Trophy, Zap, Target, Flame } from 'lucide-react'

export default function Stats() {
  const { progress, errorBank, dailyGoal, setDailyGoal, getMasteredIds, getDueReviewIds, getStreak, dailyLog } =
    useUserStore()
  const { words } = useWordStore()

  const all = Object.values(progress)
  const masteredIds = getMasteredIds()
  const mastered = masteredIds.size
  const learning = all.filter((p) => p.status === 'learning').length
  const dueReview = getDueReviewIds().length
  const graduated = all.filter((p) => p.status === 'mastered' && p.dueDate === null).length

  // Last 14 days of activity
  const streak = getStreak()
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - 13 + i)
    const date = toDateStr(d)
    return { date, label: `${d.getMonth() + 1}/${d.getDate()}`, count: (dailyLog ?? {})[date] ?? 0 }
  })
  const maxCount = Math.max(1, ...days.map((d) => d.count))

  // Mastery by difficulty (same total-letter buckets as daily word picking);
  // memoized — three full passes over the word list shouldn't rerun on every goal tap
  const difficulty = useMemo(() => {
    return [
      { label: '简单（≤4 字母）', level: 'easy' as Difficulty, bar: 'bg-gradient-to-r from-emerald-400 to-green-500' },
      { label: '中等（5–7 字母）', level: 'medium' as Difficulty, bar: 'progress-gradient' },
      { label: '困难（≥8 字母）', level: 'hard' as Difficulty, bar: 'bg-gradient-to-r from-orange-400 to-rose-500' },
    ].map(({ label, level, bar }) => {
      const bucket = words.filter((w) => difficultyOf(w.word) === level)
      const done = bucket.filter((w) => masteredIds.has(w.id)).length
      return { label, done, total: bucket.length, bar }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, progress])
  const totalStudied = all.length
  const totalWords = words.length

  const accuracy =
    totalStudied === 0
      ? 0
      : Math.round(
          (all.reduce((sum, p) => sum + p.correctCount, 0) /
            all.reduce((sum, p) => sum + p.correctCount + p.wrongCount, 0)) *
            100
        )

  const masteredPct = pct(mastered, totalWords)

  const statCards = [
    { label: '已掌握', value: mastered, icon: CircleCheck, tile: 'bg-linear-to-br from-green-400 to-emerald-600' },
    { label: '学习中', value: learning, icon: BookOpen, tile: 'bg-linear-to-br from-amber-500 to-amber-600' },
    { label: '待复习', value: dueReview, icon: Clock, tile: 'bg-linear-to-br from-orange-400 to-orange-600' },
    { label: '已巩固', value: graduated, icon: Trophy, tile: 'bg-linear-to-br from-teal-400 to-cyan-600' },
    { label: '错题本', value: errorBank.length, icon: Zap, tile: 'bg-linear-to-br from-rose-400 to-red-500' },
    { label: '正确率', value: `${accuracy}%`, icon: Target, tile: 'bg-linear-to-br from-sky-400 to-blue-600' },
  ]

  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <div className="mb-7 flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-extrabold tracking-tight">学习统计</h1>
      </div>

      {/* Overall progress */}
      <div className="glass-card mb-4 rounded-[1.75rem] p-6 animate-fade-up">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">总体进度</h2>
          <span className="text-2xl font-extrabold tracking-tight tabular-nums text-gradient">{masteredPct}%</span>
        </div>
        <ProgressBar value={masteredPct} className="mb-3 h-3" barClassName="progress-gradient duration-700" />
        <p className="text-right text-sm text-muted-foreground tabular-nums">{mastered} / {totalWords} 已掌握</p>
      </div>

      {/* Last 14 days activity */}
      <div className="glass-card mb-4 rounded-[1.75rem] p-6 animate-fade-up [animation-delay:70ms]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">最近 14 天</h2>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-500">
              <Flame className="h-4 w-4 fill-orange-400/80 text-orange-500" />
              连续打卡 {streak} 天
            </span>
          )}
        </div>
        <div className="flex h-24 items-end gap-1">
          {days.map((d, i) => (
            <div
              key={d.date}
              title={`${d.label}：${d.count} 题`}
              className={`flex-1 rounded-full transition-all ${
                d.count > 0
                  ? i === days.length - 1
                    ? 'progress-gradient shadow-[0_2px_8px_-2px_var(--primary)]'
                    : 'bg-primary/70'
                  : 'bg-muted'
              }`}
              style={{ height: d.count > 0 ? `${Math.max(10, (d.count / maxCount) * 100)}%` : '4px' }}
            />
          ))}
        </div>
        <div className="mt-2.5 flex justify-between text-[10px] font-medium text-muted-foreground">
          <span>{days[0].label}</span>
          <span>今天</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        {statCards.map((item, i) => (
          <div
            key={item.label}
            className="glass-card flex items-center gap-3.5 rounded-[1.4rem] p-4 animate-fade-up"
            style={{ animationDelay: `${120 + i * 45}ms` }}
          >
            <span className={`icon-tile h-10 w-10 shrink-0 rounded-[0.85rem] ${item.tile}`}>
              <item.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-2xl font-extrabold leading-tight tracking-tight tabular-nums">{item.value}</div>
              <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Mastery by difficulty */}
      <div className="glass-card mb-4 rounded-[1.75rem] p-6 animate-fade-up [animation-delay:400ms]">
        <h2 className="mb-5 text-sm font-semibold text-muted-foreground">难度分层掌握</h2>
        <div className="flex flex-col gap-4">
          {difficulty.map((d) => (
            <div key={d.label}>
              <div className="mb-1.5 flex justify-between text-xs font-medium text-muted-foreground">
                <span>{d.label}</span>
                <span className="tabular-nums">{d.done} / {d.total}</span>
              </div>
              <ProgressBar
                value={d.total === 0 ? 0 : (d.done / d.total) * 100}
                className="h-2"
                barClassName={`${d.bar} duration-700`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Daily goal setting */}
      <div className="glass-card mt-2 rounded-[1.75rem] p-6 animate-fade-up [animation-delay:460ms]">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">每日目标</h2>
        <div className="glass-chip flex gap-1 rounded-full p-1">
          {[10, 20, 30, 50].map((n) => (
            <button
              key={n}
              onClick={() => setDailyGoal(n)}
              className={`flex-1 rounded-full py-2 text-sm font-semibold tabular-nums transition-all duration-200 ${
                dailyGoal === n
                  ? 'bg-brand-gradient text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {n} 个
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
