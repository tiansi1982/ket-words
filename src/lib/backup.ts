import type { ProfileData } from '@/types'
import { remapProfileData } from '@/lib/word-aliases'
import { DEFAULT_DAILY_GOAL } from '@/lib/settings'

// Backup file format (F9): one profile's data, so a family can move a child
// between devices without a cloud account. Import merges (never discards).
export const BACKUP_APP = 'ket-words'
export const BACKUP_VERSION = 1

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string // ISO
  profileName: string
  data: ProfileData
}

export function makeBackup(profileName: string, data: ProfileData, now = new Date()): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), profileName, data }
}

export function backupFilename(profileName: string, now = new Date()): string {
  const safe = profileName.replace(/[\\/:*?"<>|\s]+/g, '_') || 'profile'
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `ket-words-${safe}-${d}.json`
}

// Error-bank stamps (R02): integer word ids → non-zero finite timestamps
function parseStamps(raw: unknown): Record<number, number> {
  const out: Record<number, number> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw)) {
    const id = Number(k)
    if (Number.isInteger(id) && typeof v === 'number' && Number.isFinite(v) && v !== 0) out[id] = v
  }
  return out
}

// Parse a backup file; null when it isn't one. Only the learning fields are
// taken, with pre-dedupe word ids folded in, so a hand-edited or stale file
// can't smuggle in anything odd.
export function parseBackup(text: string): { profileName: string; data: ProfileData } | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Partial<Backup>
  if (b.app !== BACKUP_APP || typeof b.version !== 'number' || !b.data || typeof b.data !== 'object') return null
  const d = b.data as Partial<ProfileData>
  if (!d.progress || typeof d.progress !== 'object' || !Array.isArray(d.errorBank ?? [])) return null
  const progress: ProfileData['progress'] = {}
  for (const [k, p] of Object.entries(d.progress)) {
    const id = Number(k)
    if (!Number.isInteger(id) || !p || typeof p !== 'object') continue
    const rec = p as ProfileData['progress'][number]
    if (typeof rec.correctCount !== 'number' || typeof rec.wrongCount !== 'number') continue
    progress[id] = { ...rec, wordId: id }
  }
  const data: ProfileData = {
    dailyGoal: typeof d.dailyGoal === 'number' ? d.dailyGoal : DEFAULT_DAILY_GOAL,
    currentSession: d.currentSession ?? null,
    progress,
    errorBank: (d.errorBank ?? []).filter((id): id is number => Number.isInteger(id)),
    dailyLog: d.dailyLog && typeof d.dailyLog === 'object' ? d.dailyLog : {},
    settings: d.settings && typeof d.settings === 'object' ? d.settings : {},
    errorSession: d.errorSession ?? null,
    placement: d.placement ?? null,
    dailyRight: d.dailyRight && typeof d.dailyRight === 'object' ? d.dailyRight : {},
    achievementsSeen: Array.isArray(d.achievementsSeen) ? d.achievementsSeen.filter((x): x is string => typeof x === 'string') : [],
    errorBankAt: parseStamps(d.errorBankAt),
    dailyGoalSetAt: typeof d.dailyGoalSetAt === 'number' && d.dailyGoalSetAt > 0 ? d.dailyGoalSetAt : 0,
  }
  return { profileName: typeof b.profileName === 'string' ? b.profileName : '', data: remapProfileData(data) }
}

export function describeData(data: ProfileData): string {
  const n = Object.keys(data.progress).length
  const mastered = Object.values(data.progress).filter((p) => p.status === 'mastered').length
  return `${n} 个词有记录，其中已掌握 ${mastered} 个，错题 ${data.errorBank.length} 个`
}
