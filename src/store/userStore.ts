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
}

function todayStr(): string {
  // Local date, not UTC — toISOString() would roll the day over at 8am in China
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
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
          const status: StudyStatus =
            correctCount >= 3 ? 'mastered' : 'learning'
          return {
            progress: {
              ...state.progress,
              [wordId]: {
                ...existing,
                correctCount,
                wrongCount,
                status,
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
    }),
    { name: 'ket-words-user' }
  )
)
