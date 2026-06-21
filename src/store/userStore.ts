import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserState, WordProgress, StudyStatus } from '@/types'

interface UserStore extends UserState {
  setDailyGoal: (goal: number) => void
  startDailySession: (wordIds: number[]) => void
  completeDailySession: () => void
  updateProgress: (wordId: number, correct: boolean) => void
  addToErrorBank: (wordId: number) => void
  removeFromErrorBank: (wordId: number) => void
  getWordStatus: (wordId: number) => StudyStatus
  getTodayDate: () => string
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
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
            completed: false,
          },
        }),

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
