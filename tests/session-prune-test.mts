// R2: sessions referencing ids the dictionary no longer has must not strand
// the study page — unknown ids are dropped and the cursor stays on the same word
import assert from 'node:assert'
import { test } from 'vitest'

test('session-prune-test', async () => {

const mem = new Map<string, string>()
const stub = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}
Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

const { useUserStore } = await import('../src/store/userStore')
const { pruneSessionWords } = await import('../src/lib/session')
const s = () => useUserStore.getState()
const known = new Set([1, 2, 3, 4])
const isKnown = (id: number) => known.has(id)

// ── pure helper ──
{
  const session = { date: '2026-01-01', wordIds: [1, 99, 2, 98, 3], currentIndex: 0, completed: false }
  const out = pruneSessionWords(session, isKnown)
  assert.deepEqual(out.wordIds, [1, 2, 3])
  assert.equal(out.currentIndex, 0)
}
{
  // cursor was on 98 (index 3) → after pruning it points at 3 (index 2)
  const session = { date: '2026-01-01', wordIds: [1, 99, 2, 98, 3], currentIndex: 3, completed: false }
  const out = pruneSessionWords(session, isKnown)
  assert.deepEqual(out.wordIds, [1, 2, 3])
  assert.equal(out.currentIndex, 2, 'cursor keeps pointing at the next surviving word')
}
{
  // cursor past the removed tail → lands at the end (finished)
  const session = { date: '2026-01-01', wordIds: [1, 2, 99], currentIndex: 3, completed: false }
  const out = pruneSessionWords(session, isKnown)
  assert.deepEqual(out.wordIds, [1, 2])
  assert.equal(out.currentIndex, 2)
}
{
  // duplicates collapse too (a merged alias can produce the same id twice)
  const session = { date: '2026-01-01', wordIds: [1, 1, 2], currentIndex: 2, completed: false }
  const out = pruneSessionWords(session, isKnown)
  assert.deepEqual(out.wordIds, [1, 2])
  assert.equal(out.currentIndex, 1)
}
{
  // nothing to prune → same object (lets the store skip a set())
  const session = { date: '2026-01-01', wordIds: [1, 2], currentIndex: 1, completed: false }
  assert.strictEqual(pruneSessionWords(session, isKnown), session)
}
{
  // sessions persisted before currentIndex existed
  const session = { date: '2026-01-01', wordIds: [99, 1], completed: false } as any
  const out = pruneSessionWords(session, isKnown)
  assert.deepEqual(out.wordIds, [1])
  assert.equal(out.currentIndex, 0)
}

// ── store action ──
s().startDailySession([1, 99, 2])
s().advanceSession()
s().advanceSession() // cursor on 2 (index 2)
s().pruneSession(isKnown)
assert.deepEqual(s().currentSession!.wordIds, [1, 2])
assert.equal(s().currentSession!.currentIndex, 1)

// all ids unknown → session cleared so the home page picks a fresh one
s().startDailySession([97, 98])
s().pruneSession(isKnown)
assert.equal(s().currentSession, null)

// no session → no crash
s().pruneSession(isKnown)
assert.equal(s().currentSession, null)

console.log('✅ session prune assertions passed')
})
