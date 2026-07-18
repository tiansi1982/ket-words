import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserState, WordProgress, StudyStatus } from '@/types'

interface UserStore extends UserState {
  setDailyGoal: (goal: number) => void
  startDailySession: (wordIds: number[]) => void
  advanceSession: () => void
  completeDailySession: () => void
  updateProgress: (wordId: number, correct: boolean) => void
  addToErrorBank: (wordId: number) => void
  removeFromErrorBank: (wordId: number) => void
  getWordStatus: (wordId: number) => StudyStatus
  getTodayDate: () => string
  // Mastered words whose review is due (most overdue first)
  getDueReviewIds: () => number[]
}

// Ebbinghaus-style review intervals in days, indexed by srsLevel.
// Passing the last one graduates the word (dueDate = null).
export const SRS_INTERVALS = [1, 3, 7, 15, 30]

function toDateStr(d: Date): string {
  // Local date, not UTC — toISOString() would roll the day over at 8am in China
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function todayStr(): string {
  return toDateStr(new Date())
}

function daysFromNowStr(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

// Records saved before SRS existed have no dueDate → count them as due
function isDue(p: WordProgress, today: string): boolean {
  return (
    p.status === 'mastered' &&
    (p.dueDate === undefined || (p.dueDate !== null && p.dueDate <= today))
  )
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      userId: null,
      dailyGoal: 20,
      currentSession: null,
      progress: {},
      errorBank: [],

      getTodayDate: () => todayStr(),

      setDailyGoal: (goal) => set({ dailyGoal: goal }),

      startDailySession: (wordIds) =>
        set({
          currentSession: {
            date: todayStr(),
            wordIds,
            currentIndex: 0,
            completed: false,
          },
        }),

      advanceSession: () =>
        set((state) => ({
          currentSession: state.currentSession
            ? {
                ...state.currentSession,
                // ?? 0 migrates sessions persisted before currentIndex existed
                currentIndex: (state.currentSession.currentIndex ?? 0) + 1,
              }
            : null,
        })),

      completeDailySession: () =>
        set((state) => ({
          currentSession: state.currentSession
            ? { ...state.currentSession, completed: true }
            : null,
        })),

      updateProgress: (wordId, correct) =>
        set((state) => {
          const existing: WordProgress = state.progress[wordId] ?? {
            wordId,
            status: 'new',
            correctCount: 0,
            wrongCount: 0,
            lastStudied: 0,
          }
          const correctCount = existing.correctCount + (correct ? 1 : 0)
          const wrongCount = existing.wrongCount + (correct ? 0 : 1)

          let status: StudyStatus = existing.status
          let srsLevel = existing.srsLevel ?? 0
          let dueDate = existing.dueDate

          if (existing.status !== 'mastered') {
            status = correctCount >= 3 ? 'mastered' : 'learning'
            if (status === 'mastered') {
              srsLevel = 0
              dueDate = daysFromNowStr(SRS_INTERVALS[0])
            }
          } else if (!correct) {
            // Forgot a mastered word: restart the review ladder from tomorrow
            srsLevel = 0
            dueDate = daysFromNowStr(SRS_INTERVALS[0])
          } else if (isDue(existing, todayStr())) {
            // Advance the schedule only when the review is actually due —
            // an early correct answer (e.g. in multiple-choice practice)
            // shouldn't skip ahead
            srsLevel += 1
            dueDate =
              srsLevel >= SRS_INTERVALS.length
                ? null // graduated
                : daysFromNowStr(SRS_INTERVALS[srsLevel])
          }

          return {
            progress: {
              ...state.progress,
              [wordId]: {
                ...existing,
                correctCount,
                wrongCount,
                status,
                srsLevel,
                dueDate,
                lastStudied: Date.now(),
              },
            },
          }
        }),

      addToErrorBank: (wordId) =>
        set((state) => ({
          errorBank: state.errorBank.includes(wordId)
            ? state.errorBank
            : [...state.errorBank, wordId],
        })),

      removeFromErrorBank: (wordId) =>
        set((state) => ({
          errorBank: state.errorBank.filter((id) => id !== wordId),
        })),

      getWordStatus: (wordId) => {
        const p = get().progress[wordId]
        return p?.status ?? 'new'
      },

      getDueReviewIds: () => {
        const today = todayStr()
        return Object.values(get().progress)
          .filter((p) => isDue(p, today))
          .sort((a, b) => ((a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : 1))
          .map((p) => p.wordId)
      },
    }),
    { name: 'ket-words-user' }
  )
)
