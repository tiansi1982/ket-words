import { useNavigate } from 'react-router-dom'
import { useUserStore, toDateStr } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { baseWord } from '@/lib/word-utils'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

export default function Stats() {
  const navigate = useNavigate()
  const { progress, errorBank, dailyGoal, setDailyGoal, getDueReviewIds, getStreak, dailyLog } = useUserStore()
  const { words } = useWordStore()

  const all = Object.values(progress)
  const mastered = all.filter((p) => p.status === 'mastered').length
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

  // Mastery by difficulty (same base-word-length buckets as daily word picking)
  const masteredIds = new Set(all.filter((p) => p.status === 'mastered').map((p) => p.wordId))
  const baseLen = (w: string) => baseWord(w).split(' ')[0].length
  const difficulty = [
    { label: '简单（≤4 字母）', match: (n: number) => n <= 4 },
    { label: '中等（5–7 字母）', match: (n: number) => n >= 5 && n <= 7 },
    { label: '困难（≥8 字母）', match: (n: number) => n >= 8 },
  ].map(({ label, match }) => {
    const bucket = words.filter((w) => match(baseLen(w.word)))
    const done = bucket.filter((w) => masteredIds.has(w.id)).length
    return { label, done, total: bucket.length }
  })
  const totalStudied = all.length
  const totalWords = 1598

  const accuracy =
    totalStudied === 0
      ? 0
      : Math.round(
          (all.reduce((sum, p) => sum + p.correctCount, 0) /
            all.reduce((sum, p) => sum + p.correctCount + p.wrongCount, 0)) *
            100
        )

  return (
    <div className="min-h-screen flex flex-col px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold ml-2">学习统计</h1>
      </div>

      {/* Overall progress */}
      <div className="bg-card border rounded-3xl p-6 mb-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">总体进度</h2>
        <div className="w-full bg-muted rounded-full h-3 mb-3">
          <div
            className="bg-primary h-3 rounded-full transition-all"
            style={{ width: `${(mastered / totalWords) * 100}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground text-right">{mastered} / {totalWords} 已掌握</p>
      </div>

      {/* Last 14 days activity */}
      <div className="bg-card border rounded-3xl p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-muted-foreground">最近 14 天</h2>
          {streak > 0 && <span className="text-sm font-medium text-orange-500">🔥 连续打卡 {streak} 天</span>}
        </div>
        <div className="h-24 flex items-end gap-0.5">
          {days.map((d) => (
            <div
              key={d.date}
              title={`${d.label}：${d.count} 题`}
              className={`flex-1 rounded-t-[4px] ${d.count > 0 ? 'bg-primary' : 'bg-muted'}`}
              style={{ height: d.count > 0 ? `${Math.max(10, (d.count / maxCount) * 100)}%` : '4px' }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>{days[0].label}</span>
          <span>今天</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: '已掌握', value: mastered, color: 'text-green-600' },
          { label: '学习中', value: learning, color: 'text-yellow-600' },
          { label: '待复习', value: dueReview, color: 'text-orange-500' },
          { label: '已巩固', value: graduated, color: 'text-emerald-600' },
          { label: '错题本', value: errorBank.length, color: 'text-red-500' },
          { label: '正确率', value: `${accuracy}%`, color: 'text-primary' },
        ].map((item) => (
          <div key={item.label} className="bg-card border rounded-2xl p-4 text-center">
            <div className={`text-3xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Mastery by difficulty */}
      <div className="bg-card border rounded-3xl p-6 mb-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">难度分层掌握</h2>
        <div className="flex flex-col gap-4">
          {difficulty.map((d) => (
            <div key={d.label}>
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>{d.label}</span>
                <span>{d.done} / {d.total}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${d.total === 0 ? 0 : (d.done / d.total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily goal setting */}
      <div className="bg-card border rounded-3xl p-6 mt-2">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">每日目标</h2>
        <div className="flex gap-3 flex-wrap">
          {[10, 20, 30, 50].map((n) => (
            <button
              key={n}
              onClick={() => setDailyGoal(n)}
              className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors ${
                dailyGoal === n
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground hover:border-primary'
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
