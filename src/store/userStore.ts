import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserState, WordProgress, StudyStatus, ProfileData } from '@/types'

interface UserStore extends UserState {
  addProfile: (name: string) => void
  switchProfile: (id: string) => void
  renameProfile: (id: string, name: string) => void
  deleteProfile: (id: string) => void
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

function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const emptyProfileData = (): ProfileData => ({
  dailyGoal: 20,
  currentSession: null,
  progress: {},
  errorBank: [],
})

// The active profile's data as stored top-level in state
function snapshot(s: UserState): ProfileData {
  return {
    dailyGoal: s.dailyGoal,
    currentSession: s.currentSession,
    progress: s.progress,
    errorBank: s.errorBank,
  }
}

const initialProfileId = genId()

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      activeProfileId: initialProfileId,
      profileList: [{ id: initialProfileId, name: '孩子 1' }],
      profileData: {},
      dailyGoal: 20,
      currentSession: null,
      progress: {},
      errorBank: [],

      getTodayDate: () => todayStr(),

      addProfile: (name) =>
        set((state) => {
          const id = genId()
          return {
            // stash the current active profile's data, start the new one fresh
            profileData: { ...state.profileData, [state.activeProfileId]: snapshot(state) },
            profileList: [
              ...state.profileList,
              { id, name: name.trim() || `孩子 ${state.profileList.length + 1}` },
            ],
            activeProfileId: id,
            ...emptyProfileData(),
          }
        }),

      switchProfile: (id) =>
        set((state) => {
          if (id === state.activeProfileId || !state.profileList.some((p) => p.id === id))
            return state
          const { [id]: target, ...rest } = state.profileData
          return {
            profileData: { ...rest, [state.activeProfileId]: snapshot(state) },
            activeProfileId: id,
            ...(target ?? emptyProfileData()),
          }
        }),

      renameProfile: (id, name) =>
        set((state) => ({
          profileList: state.profileList.map((p) =>
            p.id === id ? { ...p, name: name.trim() || p.name } : p
          ),
        })),

      deleteProfile: (id) =>
        set((state) => {
          if (state.profileList.length <= 1) return state
          const profileList = state.profileList.filter((p) => p.id !== id)
          if (id !== state.activeProfileId) {
            const { [id]: _removed, ...profileData } = state.profileData
            return { profileList, profileData }
          }
          // deleting the active profile: activate the first remaining one
          const nextId = profileList[0].id
          const { [nextId]: next, [id]: _removed, ...profileData } = state.profileData
          return {
            profileList,
            profileData,
            activeProfileId: nextId,
            ...(next ?? emptyProfileData()),
          }
        }),

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
    {
      name: 'ket-words-user',
      version: 1,
      migrate: (persisted, version) => {
        // v0 was single-user: wrap the existing data as the first profile
        if (version === 0) {
          const id = genId()
          return {
            ...(persisted as object),
            activeProfileId: id,
            profileList: [{ id, name: '孩子 1' }],
            profileData: {},
          } as UserState
        }
        return persisted as UserState
      },
    }
  )
)
