// R02 / R18: error-bank changes and the daily goal survive the sync merge.
// Before: the bank merged as a union (a cleared word came straight back from
// the cloud), the cloud's old error round filled in for one ended here, and
// a new device's default goal overwrote the one chosen elsewhere.
import assert from 'node:assert'
import { test } from 'vitest'
import type { ProfileData } from '../src/types'

test('sync-merge-r02-test', async () => {
  const mem = new Map<string, string>()
  const stub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

  const { mergeErrorBanks, ERROR_TOMBSTONE_TTL_MS } = await import('../src/lib/error-bank')
  const { mergeProfileData } = await import('../src/services/sync')
  const { useUserStore } = await import('../src/store/userStore')
  const { remapProfileData } = await import('../src/lib/word-aliases')
  const { makeBackup, parseBackup } = await import('../src/lib/backup')
  const s = () => useUserStore.getState()

  const base = (over: Partial<ProfileData> = {}): ProfileData => ({
    dailyGoal: 20, currentSession: null, progress: {}, errorBank: [], dailyLog: {}, ...over,
  })
  const now = Date.now()

  // ── mergeErrorBanks: newest change per word wins ──
  // The review's repro: cloud (older client, no stamps) still has word 1; it
  // was cleared here after practice → stays cleared
  let m = mergeErrorBanks({ errorBank: [], errorBankAt: { 1: -now } }, { errorBank: [1] }, now)
  assert.deepEqual(m.errorBank, [], 'stamped removal beats an unstamped cloud copy')
  assert.deepEqual(m.errorBankAt, { 1: -now }, 'tombstone kept for other devices')

  m = mergeErrorBanks({ errorBank: [], errorBankAt: { 1: -100 } }, { errorBank: [1], errorBankAt: { 1: 200 } }, 300)
  assert.deepEqual(m.errorBank, [1], 'wrong again elsewhere after the removal → back in')
  assert.deepEqual(m.errorBankAt, { 1: 200 })

  m = mergeErrorBanks({ errorBank: [1], errorBankAt: { 1: 100 } }, { errorBank: [], errorBankAt: { 1: -200 } }, 300)
  assert.deepEqual(m.errorBank, [], 'removal elsewhere after our add → out')

  m = mergeErrorBanks({ errorBank: [1], errorBankAt: { 1: 100 } }, { errorBank: [], errorBankAt: { 1: -100 } }, 300)
  assert.deepEqual(m.errorBank, [1], 'tie keeps the word')

  m = mergeErrorBanks({ errorBank: [5, 1] }, { errorBank: [9, 5] }, now)
  assert.deepEqual(m.errorBank, [5, 1, 9], 'unstamped on both sides: union, local order first')
  assert.deepEqual(m.errorBankAt, {}, 'no stamps invented for legacy entries')

  m = mergeErrorBanks({ errorBank: [], errorBankAt: { 3: -(now - ERROR_TOMBSTONE_TTL_MS - 1) } }, { errorBank: [] }, now)
  assert.deepEqual(m.errorBankAt, {}, 'expired tombstone dropped')

  // ── store actions stamp every change ──
  s().addToErrorBank(42)
  const added = s().errorBankAt![42]
  assert.ok(added > 0, 'add stamps +t')
  s().removeFromErrorBank(42)
  assert.ok(s().errorBankAt![42] < 0 && -s().errorBankAt![42] >= added, 'remove stamps −t')
  s().addToErrorBank(42)
  s().addToErrorBank(42)
  assert.deepEqual(s().errorBank, [42], 'no duplicate')
  assert.ok(s().errorBankAt![42] > 0, 're-adding restamps even when already banked')
  s().markKnown([42])
  assert.deepEqual(s().errorBank, [])
  assert.ok(s().errorBankAt![42] < 0, 'mark known stamps the removal')
  const before = s().errorBankAt
  s().removeFromErrorBank(999)
  assert.equal(s().errorBankAt, before, 'removing a word not in the bank is a no-op')

  // ── the loop from the review, through mergeProfileData ──
  // Cloud holds word 7 and an unfinished-then-finished round; here the word
  // was cleared and the round ended. Neither comes back.
  const cloud = base({ errorBank: [7], errorSession: { wordIds: [7], currentIndex: 1, cleared: [7] } })
  const local = base({ errorBank: [], errorBankAt: { 7: -now }, errorSession: null })
  const merged = mergeProfileData(local, cloud)
  assert.deepEqual(merged.errorBank, [], 'cleared word stays cleared after sync')
  assert.equal(merged.errorSession, null, 'ended round stays ended after sync')
  const again = mergeProfileData(merged, cloud)
  assert.deepEqual(again.errorBank, [], 'and on the next sync too')

  // ── daily goal (R18) ──
  const goal = (g: number, at?: number) => base({ dailyGoal: g, ...(at === undefined ? {} : { dailyGoalSetAt: at }) })
  assert.equal(mergeProfileData(goal(20), goal(50)).dailyGoal, 50, 'fresh device default loses to the cloud goal')
  assert.equal(mergeProfileData(goal(30), goal(50)).dailyGoal, 30, 'two unstamped choices: local')
  assert.equal(mergeProfileData(goal(20), goal(50, 0)).dailyGoal, 50)
  assert.equal(mergeProfileData(goal(50, 100), goal(10, 200)).dailyGoal, 10, 'newer choice wins')
  assert.equal(mergeProfileData(goal(50, 300), goal(10, 200)).dailyGoal, 50)
  assert.equal(mergeProfileData(goal(20, 300), goal(50)).dailyGoal, 20, 'an explicit 20 is a choice, not a default')
  assert.equal(mergeProfileData(goal(20, 300), goal(50)).dailyGoalSetAt, 300)
  s().setDailyGoal(35)
  assert.ok((s().dailyGoalSetAt ?? 0) > 0, 'setDailyGoal stamps the choice')

  // ── word-id aliases fold stamps too (601 → 572) ──
  const remapped = remapProfileData(base({ errorBank: [572], errorBankAt: { 601: 500, 572: -100 } }))
  assert.deepEqual(remapped.errorBankAt, { 572: 500 }, 'aliased stamp folded, newer change kept')

  // ── backups carry the stamps ──
  const data = base({ errorBank: [3], errorBankAt: { 3: 900, 4: -800, 5: 0 }, dailyGoal: 40, dailyGoalSetAt: 700 })
  const parsed = parseBackup(JSON.stringify(makeBackup('kid', data)))!
  assert.deepEqual(parsed.data.errorBankAt, { 3: 900, 4: -800 }, 'zero stamps dropped on import')
  assert.equal(parsed.data.dailyGoalSetAt, 700)
  const junk = parseBackup(JSON.stringify(makeBackup('kid', { ...data, errorBankAt: { x: 1, 6: 'a' } as never })))!
  assert.deepEqual(junk.data.errorBankAt, {}, 'malformed stamps ignored')
})
