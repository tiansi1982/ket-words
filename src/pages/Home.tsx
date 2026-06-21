import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { Button } from '@/components/ui/button'
import { BookOpen, Zap, BarChart2, Brain } from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()
  const { progress, dailyGoal, errorBank, currentSession, startDailySession, getTodayDate } = useUserStore()
  const { pickDailyWords } = useWordStore()

  const masteredIds = new Set(
    Object.values(progress)
      .filter((p) => p.status === 'mastered')
      .map((p) => p.wordId)
  )
  const totalMastered = masteredIds.size
  const totalWords = 1598

  const handleStartDaily = () => {
    const today = getTodayDate()
    if (currentSession?.date === today && !currentSession.completed) {
      navigate('/study')
      return
    }
    const words = pickDailyWords(masteredIds, dailyGoal)
    if (words.length === 0) {
      navigate('/stats')
      return
    }
    startDailySession(words.map((w) => w.id))
    navigate('/study')
  }

  const todayDone = currentSession?.date === getTodayDate() && currentSession.completed

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12 gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-2">KET 单词</h1>
        <p className="text-muted-foreground text-lg">每天学一点，英语进步快</p>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        <div className="bg-card border rounded-2xl p-4 text-center">
          <div className="text-3xl font-bold text-primary">{totalMastered}</div>
          <div className="text-sm text-muted-foreground mt-1">已掌握</div>
        </div>
        <div className="bg-card border rounded-2xl p-4 text-center">
          <div className="text-3xl font-bold">{totalWords - totalMastered}</div>
          <div className="text-sm text-muted-foreground mt-1">待学习</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <Button
          size="lg"
          className="h-14 text-base rounded-2xl"
          onClick={handleStartDaily}
          disabled={todayDone}
        >
          <BookOpen className="mr-2 h-5 w-5" />
          {todayDone ? '今日已完成 ✓' : '开始今日学习'}
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="h-14 text-base rounded-2xl"
          onClick={() => navigate('/error-bank')}
          disabled={errorBank.length === 0}
        >
          <Zap className="mr-2 h-5 w-5" />
          错题练习
          {errorBank.length > 0 && (
            <span className="ml-2 bg-destructive text-destructive-foreground text-xs rounded-full px-2 py-0.5">
              {errorBank.length}
            </span>
          )}
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="h-14 text-base rounded-2xl"
          onClick={() => navigate('/practice')}
        >
          <Brain className="mr-2 h-5 w-5" />
          选择题练习
        </Button>

        <Button
          size="lg"
          variant="ghost"
          className="h-14 text-base rounded-2xl"
          onClick={() => navigate('/stats')}
        >
          <BarChart2 className="mr-2 h-5 w-5" />
          学习统计
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        每日目标：{dailyGoal} 个单词
      </p>
    </div>
  )
}
