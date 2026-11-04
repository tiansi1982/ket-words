import { useAchievements } from '@/lib/use-achievements'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { BackButton } from '@/components/PageHeader'

// Badge wall (F8): earned ones in colour, the rest greyed with progress
export default function Achievements() {
  const { input, earned } = useAchievements()
  const earnedSet = new Set(earned)
  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <div className="mb-6 flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-extrabold tracking-tight">成就</h1>
        <span className="glass-chip ml-auto rounded-full px-3 py-1 text-sm font-semibold tabular-nums text-muted-foreground">
          {earned.length} / {ACHIEVEMENTS.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {ACHIEVEMENTS.map((a, i) => {
          const got = earnedSet.has(a.id)
          const { value, target } = a.progress(input)
          return (
            <div
              key={a.id}
              className={`glass-card flex flex-col items-center gap-1.5 rounded-[1.4rem] p-4 text-center animate-fade-up ${got ? '' : 'opacity-60'}`}
              style={{ animationDelay: `${i * 30}ms` }}
              aria-label={`${a.title}${got ? '，已获得' : `，${value} / ${target}`}`}
            >
              <span className={`text-4xl ${got ? '' : 'grayscale'}`}>{a.icon}</span>
              <span className="text-sm font-bold leading-tight">{a.title}</span>
              <span className="text-[11px] leading-snug text-muted-foreground">{a.desc}</span>
              <span className={`mt-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${got ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>
                {got ? '已获得' : `${value} / ${target}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
