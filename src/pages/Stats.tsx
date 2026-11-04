import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore, toDateStr } from '@/store/userStore'
import { useSettings } from '@/lib/use-settings'
import { summarizeWeek, weekStart, hardestWords } from '@/lib/weekly'
import { useAchievements } from '@/lib/use-achievements'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { displayWord } from '@/lib/word-utils'
import { speakWordAndExample } from '@/lib/speak'
import { useWordStore } from '@/store/wordStore'
import { difficultyOf, type Difficulty } from '@/lib/word-utils'
import { pct } from '@/lib/utils'
import { BackButton } from '@/components/PageHeader'
import ProgressBar from '@/components/ProgressBar'
import { CircleCheck, BookOpen, Clock, Trophy, Zap, Target, Flame, SlidersHorizontal, ChevronRight, CalendarRange, Award } from 'lucide-react'

export default function Stats() {
  const navigate = useNavigate()
  const { progress, errorBank, dailyGoal, getMasteredIds, getDueReviewIds, getStreak, dailyLog, getProfileData, activeProfileId } = useUserStore()
  const settings = useSettings()
  const { words, getWord } = useWordStore()
  const { earned } = useAchievements()

  // This week vs last week (F6)
  const weekly = useMemo(() => {
    const data = getProfileData(activeProfileId)
    if (!data) return null
    const monday = weekStart(new Date())
    const lastMonday = new Date(monday)
    lastMonday.setDate(monday.getDate() - 7)
    return { now: summarizeWeek(data, monday), prev: summarizeWeek(data, lastMonday), hardest: hardestWords(data, 5) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, dailyLog, errorBank, activeProfileId])
  const delta = (a: number, b: number) => (a === b ? '' : a > b ? ` ↑${a - b}` : ` ↓${b - a}`)
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`

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

      {/* This week (F6) */}
      {weekly && (
        <div className="glass-card mb-4 rounded-[1.75rem] p-6 animate-fade-up [animation-delay:100ms]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <CalendarRange className="h-4 w-4" /> 本周 {md(weekly.now.start)}–{md(weekly.now.end)}
            </h2>
            <span className="text-[11px] text-muted-foreground">括号内与上周比</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '学习天数', value: `${weekly.now.days} 天`, diff: delta(weekly.now.days, weekly.prev.days) },
              { label: '答题', value: `${weekly.now.answers} 题`, diff: delta(weekly.now.answers, weekly.prev.answers) },
              { label: '正确率', value: weekly.now.accuracy === null ? '—' : `${weekly.now.accuracy}%`, diff: weekly.now.accuracy !== null && weekly.prev.accuracy !== null ? delta(weekly.now.accuracy, weekly.prev.accuracy) : '' },
              { label: '新掌握', value: `${weekly.now.mastered} 词`, diff: delta(weekly.now.mastered, weekly.prev.mastered) },
            ].map((t) => (
              <div key={t.label} className="glass-chip rounded-2xl px-3 py-2.5">
                <div className="text-lg font-extrabold tracking-tight tabular-nums">
                  {t.value}
                  {t.diff && <span className={`ml-1 text-xs font-semibold ${t.diff.startsWith(' ↑') ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{t.diff}</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">{t.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground tabular-nums">
            {weekly.now.speakAvg !== null ? `本周跟读平均 ${weekly.now.speakAvg} 分` : '本周还没有跟读记录'}
          </p>
          {weekly.hardest.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">最常错的词（点一下朗读）</div>
              <div className="flex flex-wrap gap-1.5">
                {weekly.hardest.map((id) => {
                  const w = getWord(id)
                  if (!w) return null
                  return (
                    <button key={id} onClick={() => speakWordAndExample(w)} className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-300 active:scale-95">
                      {displayWord(w.word)}
                      {(progress[id]?.consecutiveWrong ?? 0) >= 2 && <span className="ml-1 opacity-70 tabular-nums">×{progress[id]!.consecutiveWrong}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Achievements strip (F8) */}
      <button
        onClick={() => navigate('/achievements')}
        className="glass-card mb-4 flex w-full items-center gap-3 rounded-[1.4rem] p-4 text-left animate-fade-up [animation-delay:115ms] transition-colors hover:bg-muted/60"
      >
        <span className="icon-tile h-10 w-10 shrink-0 rounded-[0.85rem] bg-linear-to-br from-amber-400 to-orange-500">
          <Award className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold tabular-nums">成就 {earned.length} / {ACHIEVEMENTS.length}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {earned.length ? ACHIEVEMENTS.filter((a) => earned.includes(a.id)).map((a) => a.icon).join(' ') : '完成今天的学习拿第一个徽章'}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
      </button>

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

      <p className="mb-4 px-1 text-[11px] leading-relaxed text-muted-foreground">
        跟读和拼写各算一题：跟读没过关（或跳过）也记一次错误、进错题本，并重置该词的复习间隔。
      </p>

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

      {/* Goal / pass mark live in Settings now (R10) */}
      <button
        onClick={() => navigate('/settings')}
        className="glass-card mt-2 flex w-full items-center gap-3 rounded-[1.4rem] p-4 text-left animate-fade-up [animation-delay:460ms] transition-colors hover:bg-muted/60"
      >
        <span className="icon-tile h-10 w-10 shrink-0 rounded-[0.85rem] bg-linear-to-br from-slate-400 to-slate-600">
          <SlidersHorizontal className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold tabular-nums">每日目标 {dailyGoal} 个 · 跟读通过线 {settings.passScore} 分</span>
          <span className="block text-xs text-muted-foreground">在「设置」里调整</span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
      </button>
    </div>
  )
}
