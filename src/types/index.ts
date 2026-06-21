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
}

export interface DailySession {
  date: string // YYYY-MM-DD
  wordIds: number[]
  completed: boolean
}

export interface UserState {
  userId: string | null
  dailyGoal: number // words per day, default 20
  currentSession: DailySession | null
  progress: Record<number, WordProgress>
  errorBank: number[] // wordIds in error bank
}
