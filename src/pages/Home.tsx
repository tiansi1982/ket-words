import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { shuffled } from '@/lib/word-utils'
import { pct } from '@/lib/utils'
import ProfileSwitcher from '@/components/ProfileSwitcher'
import ProgressBar from '@/components/ProgressBar'
import { Button } from '@/components/ui/button'
import { BookOpen, Zap, BarChart2, Brain, ChevronRight, Flame, GraduationCap, Check } from 'lucide-react'
import type { ReactNode } from 'react'

function EntryRow({
  icon,
  tileClass,
  label,
  badge,
  disabled,
  onClick,
}: {
  icon: ReactNode
  tileClass: string
  label: string
  badge?: number
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition-all duration-200 hover:bg-muted/70 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
    >
      <span className={`icon-tile h-10 w-10 rounded-[0.85rem] ${tileClass}`}>{icon}</span>
      <span className="flex-1 text-[15px] font-semibold tracking-tight">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white tabular-nums shadow-sm">
          {badge}
        </span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const { progress, dailyGoal, errorBank, currentSession, startDailySession, getTodayDate, getMasteredIds, getDueReviewIds, getStreak } = useUserStore()
  const { words, pickDailyWords } = useWordStore()

  const masteredIds = getMasteredIds()
  const learningIds = new Set(
    Object.values(progress)
      .filter((p) => p.status === 'learning')
      .map((p) => p.wordId)
  )
  const totalMastered = masteredIds.size
  const totalWords = words.length

  const dueCount = getDueReviewIds().length
  const streak = getStreak()

  const handleStartDaily = () => {
    const today = getTodayDate()
    if (currentSession?.date === today && !currentSession.completed) {
      navigate('/study')
      return
    }
    // Due reviews claim daily slots first (most overdue first), new words fill the rest
    const reviewIds = getDueReviewIds().slice(0, dailyGoal)
    const newWords = pickDailyWords(masteredIds, dailyGoal - reviewIds.length, learningIds)
    const wordIds = shuffled([...reviewIds, ...newWords.map((w) => w.id)])
    if (wordIds.length === 0) {
      navigate('/stats')
      return
    }
    startDailySession(wordIds)
    navigate('/study')
  }

  const todayDone = currentSession?.date === getTodayDate() && currentSession.completed
  const masteredPct = pct(totalMastered, totalWords)

  return (
    <div className="min-h-screen flex flex-col items-center px-5 pt-12 pb-10">
      <div className="w-full max-w-md flex flex-col items-center">
        <ProfileSwitcher />

        {/* Hero */}
        <header className="mt-10 flex flex-col items-center text-center animate-fade-up">
          <div className="icon-tile h-16 w-16 rounded-[1.3rem] bg-brand-gradient animate-drift">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-[2.5rem] leading-none font-extrabold tracking-tight">
            <span className="text-gradient">KET 单词</span>
          </h1>
          <p className="mt-2.5 text-muted-foreground">每天学一点，英语进步快</p>
          {streak > 0 && (
            <div className="glass-chip mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-orange-500">
              <Flame className="h-4 w-4 fill-orange-400/80 text-orange-500" />
              连续打卡 {streak} 天
            </div>
          )}
        </header>

        {/* Progress overview */}
        <section className="glass-card mt-9 w-full rounded-[1.75rem] p-6 animate-fade-up [animation-delay:90ms]">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-4xl font-extrabold tracking-tight tabular-nums text-primary">{totalMastered}</div>
              <div className="mt-1 text-xs font-medium text-muted-foreground">已掌握</div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-extrabold tracking-tight tabular-nums">{totalWords - totalMastered}</div>
              <div className="mt-1 text-xs font-medium text-muted-foreground">待学习</div>
            </div>
          </div>
          <ProgressBar value={masteredPct} className="mt-5 h-2.5" barClassName="progress-gradient duration-700" />
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
            <span>总词库 {totalWords} 词</span>
            <span>完成度 {masteredPct}%</span>
          </div>
        </section>

        {/* Primary CTA */}
        <div className="mt-6 w-full animate-fade-up [animation-delay:170ms]">
          <Button
            onClick={handleStartDaily}
            disabled={todayDone}
            variant={todayDone ? 'glass' : 'hero'}
            className={`h-16 w-full gap-2 rounded-[1.4rem] text-lg font-bold tracking-wide ${
              todayDone ? 'text-muted-foreground disabled:opacity-100' : ''
            }`}
          >
            {todayDone ? <Check className="size-5" /> : <BookOpen className="size-5" />}
            {todayDone ? '今日已完成 ✓' : '开始今日学习'}
          </Button>
        </div>

        {/* Secondary entries */}
        <div className="glass-card mt-4 flex w-full flex-col rounded-[1.75rem] p-2 animate-fade-up [animation-delay:240ms]">
          <EntryRow
            icon={<Zap className="h-5 w-5" />}
            tileClass="bg-linear-to-br from-orange-400 to-red-500"
            label="错题练习"
            badge={errorBank.length}
            disabled={errorBank.length === 0}
            onClick={() => navigate('/error-bank')}
          />
          <div className="mx-4 h-px bg-border/60" />
          <EntryRow
            icon={<Brain className="h-5 w-5" />}
            tileClass="bg-linear-to-br from-sky-400 to-blue-600"
            label="选择题练习"
            onClick={() => navigate('/practice')}
          />
          <div className="mx-4 h-px bg-border/60" />
          <EntryRow
            icon={<BarChart2 className="h-5 w-5" />}
            tileClass="bg-linear-to-br from-teal-400 to-emerald-600"
            label="学习统计"
            onClick={() => navigate('/stats')}
          />
        </div>

        <p className="mt-6 text-xs text-muted-foreground animate-fade-up [animation-delay:310ms]">
          每日目标：{dailyGoal} 个单词
          {dueCount > 0 && <span className="font-semibold text-orange-500"> · 今日待复习 {dueCount} 个</span>}
        </p>
      </div>
    </div>
  )
}
