// R9: error-bank practice in resumable rounds, repeat offenders first
import assert from 'node:assert'
import { test } from 'vitest'

test('error-round-test', async () => {

const mem = new Map<string, string>()
const stub = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}
Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

const { useUserStore, orderErrorBank, ERROR_BATCH } = await import('../src/store/userStore')
const { mergeProfileData } = await import('../src/services/sync')
const s = () => useUserStore.getState()
const wrongTimes = (id: number, n: number) => { for (let i = 0; i < n; i++) s().updateProgress(id, false) }

// ── ordering: consecutiveWrong desc, then insertion order ──
for (const id of [1, 2, 3, 4]) s().addToErrorBank(id)
wrongTimes(3, 2)
wrongTimes(2, 1)
wrongTimes(4, 2)
assert.deepEqual(orderErrorBank(s().errorBank, s().progress), [3, 4, 2, 1])

// ── a round takes at most ERROR_BATCH, in that order ──
for (let id = 10; id < 10 + ERROR_BATCH; id++) s().addToErrorBank(id)
assert.equal(s().errorBank.length, 4 + ERROR_BATCH)
s().startErrorRound()
assert.equal(s().errorSession!.wordIds.length, ERROR_BATCH, 'capped at the batch size')
assert.deepEqual(s().errorSession!.wordIds.slice(0, 4), [3, 4, 2, 1], 'hardest first')
assert.equal(s().errorSession!.currentIndex, 0)
assert.deepEqual(s().errorSession!.cleared, [])

// ── advancing records what was cleared ──
s().removeFromErrorBank(3)
s().advanceErrorRound(true)
s().advanceErrorRound(false)
assert.equal(s().errorSession!.currentIndex, 2)
assert.deepEqual(s().errorSession!.cleared, [3])
assert.ok(!s().errorBank.includes(3))

// ── persisted, so leaving mid-round resumes ──
const persisted = JSON.parse(mem.get('ket-words-user')!)
assert.equal(persisted.state.errorSession.currentIndex, 2)

// ── pruning: words no longer in the bank drop out, cursor keeps pointing at the same word ──
s().removeFromErrorBank(1) // cleared on "another device"; it's at index 3, ahead of the cursor
const atCursor = s().errorSession!.wordIds[2]
s().pruneErrorSession((id) => s().errorBank.includes(id))
assert.ok(!s().errorSession!.wordIds.includes(1), 'word ahead of the cursor removed')
assert.ok(!s().errorSession!.wordIds.includes(3), 'already-cleared word behind the cursor removed too')
assert.equal(s().errorSession!.wordIds.length, ERROR_BATCH - 2)
assert.equal(s().errorSession!.currentIndex, 1, 'one removal behind the cursor shifts it by one')
assert.equal(s().errorSession!.wordIds[1], atCursor, 'still on the same word')
assert.strictEqual(
  (() => { const before = s().errorSession; s().pruneErrorSession(() => true); return s().errorSession === before })(),
  true,
  'nothing to prune → no state change'
)

// ── finishing and ending ──
while (s().errorSession!.currentIndex < s().errorSession!.wordIds.length) s().advanceErrorRound(false)
assert.equal(s().errorSession!.currentIndex, s().errorSession!.wordIds.length, 'finished round keeps its recap data')
s().endErrorRound()
assert.equal(s().errorSession, null)
s().advanceErrorRound(true)
assert.equal(s().errorSession, null, 'advance without a round is a no-op')

// ── empty bank → empty round ──
useUserStore.setState({ errorBank: [] })
s().startErrorRound()
assert.deepEqual(s().errorSession!.wordIds, [])
s().endErrorRound()

// ── per profile, and sync merge keeps the local round ──
s().addToErrorBank(7)
s().startErrorRound()
const kid1 = s().activeProfileId
s().addProfile('老二')
assert.equal(s().errorSession, null, 'new profile has no round')
s().switchProfile(kid1)
assert.deepEqual(s().errorSession!.wordIds, [7], 'round restored with the profile')
const base = { dailyGoal: 20, currentSession: null, progress: {}, errorBank: [], dailyLog: {} }
const round = { wordIds: [7], currentIndex: 0, cleared: [] }
assert.deepEqual(mergeProfileData({ ...base, errorSession: round }, { ...base, errorSession: { ...round, currentIndex: 1 } }).errorSession, round)
assert.deepEqual(mergeProfileData(base, { ...base, errorSession: round }).errorSession, round, 'remote fills when local has none')
assert.equal(mergeProfileData(base, base).errorSession, null)

console.log('✅ error round assertions passed')
})
