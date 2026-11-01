import type { WordProgress } from '@/types'

// Where a word stands for the child right now (word browser, filters, detail)
export type WordStatus = 'new' | 'learning' | 'due' | 'mastered' | 'graduated'

export function wordStatus(p: WordProgress | undefined, today: string): WordStatus {
  if (!p || p.status === 'new') return 'new'
  if (p.status === 'learning') return 'learning'
  if (p.dueDate === null) return 'graduated'
  if (p.dueDate === undefined || p.dueDate <= today) return 'due'
  return 'mastered'
}

export const STATUS_META: Record<WordStatus, { label: string; chip: string }> = {
  new: { label: '新词', chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  learning: { label: '学习中', chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  due: { label: '待复习', chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' },
  mastered: { label: '已掌握', chip: 'bg-green-500/15 text-green-700 dark:text-green-300' },
  graduated: { label: '已巩固', chip: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' },
}

// Review schedule in words, for the detail sheet
export function dueText(p: WordProgress | undefined, today: string): string | null {
  const st = wordStatus(p, today)
  if (st === 'due') return '今天该复习'
  if (st === 'graduated') return '已巩固，不再安排复习'
  if (st === 'mastered' && p?.dueDate) {
    const days = Math.round((Date.parse(p.dueDate) - Date.parse(today)) / 86_400_000)
    return days <= 1 ? '明天复习' : `${days} 天后复习`
  }
  return null
}
