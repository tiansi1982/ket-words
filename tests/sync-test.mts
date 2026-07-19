// P3 cloud sync: merge semantics + store support (accounts, apply, migration)
import assert from 'node:assert'
import type { ProfileData } from '../src/types'

const mem = new Map<string, string>()
const stub = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}
Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

// Seed v1 (profiles, pre-sync) persisted state to exercise the v2 migration
mem.set(
  'ket-words-user',
  JSON.stringify({
    state: {
      activeProfileId: 'kid-a',
      profileList: [{ id: 'kid-a', name: '阿大' }],
      profileData: {},
      dailyGoal: 20,
      currentSession: null,
      progress: {},
      errorBank: [],
      dailyLog: {},
    },
    version: 1,
  })
)

const { mergeProfileData, syncConfigured } = await import('../src/services/sync')
const { useUserStore, toDateStr } = await import('../src/store/userStore')
const s = () => useUserStore.getState()

// ── syncConfigured is off without VITE_LC_* env (Node has no import.meta.env) ──
assert.equal(syncConfigured, false, 'sync disabled when unconfigured')

// ── v1 → v2 migration adds syncAccounts ──
assert.deepEqual(s().syncAccounts, {}, 'migration fills empty syncAccounts')
assert.equal(s().activeProfileId, 'kid-a', 'migration keeps existing state')

// ── mergeProfileData: no learning data is ever lost ──
const today = toDateStr(new Date())
const base = (over: Partial<ProfileData>): ProfileData => ({
  dailyGoal: 20,
  currentSession: null,
  progress: {},
  errorBank: [],
  dailyLog: {},
  ...over,
})

const local = base({
  dailyGoal: 30,
  progress: {
    1: { wordId: 1, status: 'learning', correctCount: 1, wrongCount: 0, lastStudied: 200 },
    2: { wordId: 2, status: 'mastered', correctCount: 3, wrongCount: 1, lastStudied: 100 },
  },
  errorBank: [1, 5],
  dailyLog: { '2026-07-17': 4, [today]: 2 },
  currentSession: { date: today, wordIds: [1, 2, 3], currentIndex: 1, completed: false },
})
const remote = base({
  dailyGoal: 20,
  progress: {
    2: { wordId: 2, status: 'learning', correctCount: 2, wrongCount: 2, lastStudied: 300 },
    3: { wordId: 3, status: 'mastered', correctCount: 3, wrongCount: 0, lastStudied: 50 },
  },
  errorBank: [5, 9],
  dailyLog: { '2026-07-17': 1, [today]: 6 },
  currentSession: { date: today, wordIds: [1, 2, 3], currentIndex: 2, completed: false },
})

const merged = mergeProfileData(local, remote)
assert.equal(merged.progress[1].lastStudied, 200, 'local-only word kept')
assert.equal(merged.progress[2].lastStudied, 300, 'newer remote record wins per word')
assert.equal(merged.progress[3].lastStudied, 50, 'remote-only word kept')
assert.deepEqual([...merged.errorBank].sort(), [1, 5, 9], 'error banks union')
assert.equal(merged.dailyLog['2026-07-17'], 4, 'daily counts take the max per day')
assert.equal(merged.dailyLog[today], 6)
assert.equal(merged.currentSession?.currentIndex, 2, "today's session with more progress wins")
assert.equal(merged.dailyGoal, 30, 'daily goal prefers local')

// Tie on lastStudied → local wins
const tieMerged = mergeProfileData(
  base({ progress: { 7: { wordId: 7, status: 'learning', correctCount: 1, wrongCount: 0, lastStudied: 500 } } }),
  base({ progress: { 7: { wordId: 7, status: 'mastered', correctCount: 3, wrongCount: 0, lastStudied: 500 } } })
)
assert.equal(tieMerged.progress[7].status, 'learning', 'tie keeps local record')

// Stale (non-today) sessions: local falls through
const staleMerged = mergeProfileData(
  base({ currentSession: { date: '2020-01-01', wordIds: [1], currentIndex: 0, completed: true } }),
  base({ currentSession: null })
)
assert.equal(staleMerged.currentSession?.date, '2020-01-01', 'stale local session falls through')

// ── account actions ──
const acc = { username: 'kid1', sessionToken: 'tok', userObjectId: 'u1' }
s().setSyncAccount('kid-a', acc)
assert.equal(s().syncAccounts['kid-a'].username, 'kid1')
s().patchSyncAccount('kid-a', { lastSyncAt: 123, invalid: true })
assert.equal(s().syncAccounts['kid-a'].lastSyncAt, 123)
assert.equal(s().syncAccounts['kid-a'].invalid, true)
s().patchSyncAccount('missing', { lastSyncAt: 1 })
assert.equal(s().syncAccounts['missing'], undefined, 'patch on unbound profile is a no-op')

// ── getProfileData / applyProfileData for active and stashed profiles ──
s().updateProgress(42, true)
const active = s().getProfileData('kid-a')
assert.equal(active?.progress[42]?.correctCount, 1, 'reads active profile from top level')

s().applyProfileData('kid-a', merged)
assert.equal(s().progress[2].lastStudied, 300, 'apply to active profile lands top-level')
assert.equal(s().dailyGoal, 30)

s().addProfile('阿二')
const kidB = s().activeProfileId
assert.notEqual(kidB, 'kid-a')
const stashed = s().getProfileData('kid-a')
assert.equal(stashed?.progress[2]?.lastStudied, 300, 'reads stashed profile data')

s().applyProfileData('kid-a', base({ dailyGoal: 99 }))
assert.equal(s().profileData['kid-a'].dailyGoal, 99, 'apply to stashed profile lands in profileData')
assert.equal(s().dailyGoal, 20, 'active profile untouched')
s().applyProfileData('ghost', base({}))
assert.equal(s().profileData['ghost'], undefined, 'apply to unknown profile is a no-op')

// ── deleting a profile drops its account ──
s().setSyncAccount(kidB, { username: 'kid2', sessionToken: 't2', userObjectId: 'u2' })
s().deleteProfile(kidB) // active profile: falls back to kid-a
assert.equal(s().activeProfileId, 'kid-a')
assert.equal(s().syncAccounts[kidB], undefined, 'deleting active profile clears its account')
s().addProfile('阿三')
const kidC = s().activeProfileId
s().setSyncAccount(kidC, { username: 'kid3', sessionToken: 't3', userObjectId: 'u3' })
s().switchProfile('kid-a')
s().deleteProfile(kidC)
assert.equal(s().syncAccounts[kidC], undefined, 'deleting inactive profile clears its account')
s().clearSyncAccount('kid-a')
assert.deepEqual(s().syncAccounts, {})

console.log('sync-test: all assertions passed')
