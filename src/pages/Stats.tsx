import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

export default function Stats() {
  const navigate = useNavigate()
  const { progress, errorBank, dailyGoal, setDailyGoal } = useUserStore()

  const all = Object.values(progress)
  const mastered = all.filter((p) => p.status === 'mastered').length
  const learning = all.filter((p) => p.status === 'learning').length
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

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: '已掌握', value: mastered, color: 'text-green-600' },
          { label: '学习中', value: learning, color: 'text-yellow-600' },
          { label: '错题本', value: errorBank.length, color: 'text-red-500' },
          { label: '正确率', value: `${accuracy}%`, color: 'text-primary' },
        ].map((item) => (
          <div key={item.label} className="bg-card border rounded-2xl p-4 text-center">
            <div className={`text-3xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
          </div>
        ))}
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
