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

export interface UserState {
  userId: string | null
  dailyGoal: number // words per day, default 20
  currentSession: DailySession | null
  progress: Record<number, WordProgress>
  errorBank: number[] // wordIds in error bank
}
