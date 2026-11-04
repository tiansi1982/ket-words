import { useMemo, useCallback } from 'react'
import { useUserStore } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { ACHIEVEMENTS, achievementInput, earnedAchievements, type AchievementInput } from '@/lib/achievements'

// Badge state for the active profile: everything earned, and the ones the
// child hasn't been shown yet (F8)
export function useAchievements(): {
  input: AchievementInput
  earned: string[]
  fresh: string[]
  markSeen: () => void
} {
  const progress = useUserStore((s) => s.progress)
  const dailyLog = useUserStore((s) => s.dailyLog)
  const errorBank = useUserStore((s) => s.errorBank)
  const placement = useUserStore((s) => s.placement)
  const seen = useUserStore((s) => s.achievementsSeen)
  const getStreak = useUserStore((s) => s.getStreak)
  const markAchievementsSeen = useUserStore((s) => s.markAchievementsSeen)
  const totalWords = useWordStore((s) => s.words.length)

  const input = useMemo(
    () => achievementInput({ progress, dailyLog, errorBank, placement }, getStreak(), totalWords),
    [progress, dailyLog, errorBank, placement, getStreak, totalWords]
  )
  const earned = useMemo(() => earnedAchievements(input), [input])
  const fresh = useMemo(() => {
    const s = new Set(seen ?? [])
    return earned.filter((id) => !s.has(id))
  }, [earned, seen])
  const markSeen = useCallback(() => {
    if (fresh.length) markAchievementsSeen(fresh)
  }, [fresh, markAchievementsSeen])
  return { input, earned, fresh, markSeen }
}

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)
