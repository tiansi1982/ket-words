export interface Word {
  id: number
  word: string
  pos: string
  pos_cn: string
  definition: string
  example: string
  example_cn: string
}

export type StudyStatus = 'new' | 'learning' | 'mastered'

export interface WordProgress {
  wordId: number
  status: StudyStatus
  correctCount: number
  wrongCount: number
  lastStudied: number // timestamp
  // SRS review schedule, only meaningful once status is 'mastered'.
  // srsLevel indexes SRS_INTERVALS; dueDate is YYYY-MM-DD local,
  // null = graduated (passed all review intervals, no more reviews).
  // Both absent on records saved before SRS existed → treated as due today.
  srsLevel?: number
  dueDate?: string | null
}

export interface DailySession {
  date: string // YYYY-MM-DD (local time)
  wordIds: number[]
  currentIndex: number // resume position within the session
  completed: boolean
}

export interface ProfileMeta {
  id: string
  name: string
}

// Per-profile learning data. The active profile's copy lives at the top level
// of UserState (so pages read it directly); inactive profiles' copies are
// stashed in profileData and swapped in on switch.
export interface ProfileData {
  dailyGoal: number // words per day, default 20
  currentSession: DailySession | null
  progress: Record<number, WordProgress>
  errorBank: number[] // wordIds in error bank
}

export interface UserState extends ProfileData {
  activeProfileId: string
  profileList: ProfileMeta[]
  profileData: Record<string, ProfileData> // keyed by profile id, active profile excluded
}
