import { toDateStr } from '@/store/userStore'
import type { ProfileData, WordProgress } from '@/types'

// Parent report numbers for one Monday–Sunday week (F6), from profile data
export interface WeekSummary {
  start: string // YYYY-MM-DD (Monday)
  end: string // YYYY-MM-DD (Sunday)
  days: number // days with at least one answer
  answers: number
  right: number
  accuracy: number | null // 0–100, null when no answers
  mastered: number // words that became mastered this week (masteredAt)
  speakAvg: number | null // average last read-aloud score of words studied this week
}

export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - day)
  return x
}

function weekDates(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return toDateStr(d)
  })
}

export function summarizeWeek(data: ProfileData, start: Date): WeekSummary {
  const dates = weekDates(start)
  const from = new Date(start).getTime()
  const to = from + 7 * 86_400_000
  let answers = 0
  let right = 0
  let days = 0
  for (const d of dates) {
    const n = data.dailyLog?.[d] ?? 0
    if (n > 0) days++
    answers += n
    right += data.dailyRight?.[d] ?? 0
  }
  right = Math.min(right, answers)
  const all = Object.values(data.progress) as WordProgress[]
  const mastered = all.filter((p) => p.masteredAt !== undefined && p.masteredAt >= from && p.masteredAt < to).length
  const scores = all
    .filter((p) => p.lastStudied >= from && p.lastStudied < to && typeof p.lastSpeakScore === 'number')
    .map((p) => p.lastSpeakScore as number)
  return {
    start: dates[0],
    end: dates[6],
    days,
    answers,
    right,
    accuracy: answers ? Math.round((right / answers) * 100) : null,
    mastered,
    speakAvg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  }
}

// The words giving the most trouble right now: error-bank entries by
// consecutive misses, then total misses
export function hardestWords(data: ProfileData, n = 5): number[] {
  return [...data.errorBank]
    .map((id) => ({ id, p: data.progress[id] }))
    .sort((a, b) => (b.p?.consecutiveWrong ?? 0) - (a.p?.consecutiveWrong ?? 0) || (b.p?.wrongCount ?? 0) - (a.p?.wrongCount ?? 0))
    .slice(0, n)
    .map((x) => x.id)
}
