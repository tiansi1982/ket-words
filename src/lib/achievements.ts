import type { ProfileData, WordProgress } from '@/types'

// Badges (F8). Everything is derived from profile data, so a badge can never
// be "lost" by a sync merge; only which ones the child has already been
// shown is stored (achievementsSeen).
export interface Achievement {
  id: string
  icon: string
  title: string
  desc: string
  // progress toward the badge, for the "N / M" hint on unearned ones
  progress: (s: AchievementInput) => { value: number; target: number }
}

export interface AchievementInput {
  streak: number
  mastered: number
  graduated: number
  speakPasses: number
  maxDaily: number
  placementDone: boolean
  errorBankCleared: boolean // studied, made mistakes, and the bank is empty now
  totalWords: number
}

const count = (value: number, target: number) => ({ value: Math.min(value, target), target })

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'streak_3', icon: '🔥', title: '连续 3 天', desc: '连续学习 3 天', progress: (s) => count(s.streak, 3) },
  { id: 'streak_7', icon: '🔥', title: '连续一周', desc: '连续学习 7 天', progress: (s) => count(s.streak, 7) },
  { id: 'streak_30', icon: '🏅', title: '连续一个月', desc: '连续学习 30 天', progress: (s) => count(s.streak, 30) },
  { id: 'streak_100', icon: '👑', title: '百日打卡', desc: '连续学习 100 天', progress: (s) => count(s.streak, 100) },
  { id: 'mastered_50', icon: '🌱', title: '起步', desc: '掌握 50 个词', progress: (s) => count(s.mastered, 50) },
  { id: 'mastered_200', icon: '🌿', title: '小有所成', desc: '掌握 200 个词', progress: (s) => count(s.mastered, 200) },
  { id: 'mastered_500', icon: '🌳', title: '半壁江山', desc: '掌握 500 个词', progress: (s) => count(s.mastered, 500) },
  { id: 'mastered_1000', icon: '🏆', title: '千词达人', desc: '掌握 1000 个词', progress: (s) => count(s.mastered, 1000) },
  { id: 'mastered_all', icon: '🎓', title: 'KET 通关', desc: '掌握全部词汇', progress: (s) => count(s.mastered, s.totalWords) },
  { id: 'graduated_100', icon: '💎', title: '牢牢记住', desc: '100 个词通过全部复习', progress: (s) => count(s.graduated, 100) },
  { id: 'speak_50', icon: '🎤', title: '开口说', desc: '跟读过关 50 次', progress: (s) => count(s.speakPasses, 50) },
  { id: 'speak_300', icon: '🎙️', title: '小小播音员', desc: '跟读过关 300 次', progress: (s) => count(s.speakPasses, 300) },
  { id: 'day_50', icon: '⚡', title: '学霸的一天', desc: '一天里答 50 题', progress: (s) => count(s.maxDaily, 50) },
  { id: 'placement', icon: '📋', title: '找到起点', desc: '完成摸底测试', progress: (s) => count(s.placementDone ? 1 : 0, 1) },
  { id: 'errorbank_zero', icon: '🧹', title: '清零', desc: '把错题本练到空', progress: (s) => count(s.errorBankCleared ? 1 : 0, 1) },
]

export function achievementInput(
  data: Pick<ProfileData, 'progress' | 'dailyLog' | 'errorBank' | 'placement'>,
  streak: number,
  totalWords: number
): AchievementInput {
  const all = Object.values(data.progress) as WordProgress[]
  const mastered = all.filter((p) => p.status === 'mastered').length
  const graduated = all.filter((p) => p.status === 'mastered' && p.dueDate === null).length
  const speakPasses = all.reduce((n, p) => n + (p.speakPassCount ?? 0), 0)
  const maxDaily = Math.max(0, ...Object.values(data.dailyLog ?? {}))
  const wrongEver = all.some((p) => p.wrongCount > 0)
  return {
    streak,
    mastered,
    graduated,
    speakPasses,
    maxDaily,
    placementDone: !!data.placement,
    errorBankCleared: wrongEver && data.errorBank.length === 0,
    totalWords,
  }
}

export function earnedAchievements(input: AchievementInput): string[] {
  return ACHIEVEMENTS.filter((a) => {
    const { value, target } = a.progress(input)
    return target > 0 && value >= target
  }).map((a) => a.id)
}
