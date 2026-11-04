// F3: placement record in the store and sync; estimate steers the daily picker
import assert from 'node:assert'
import { test } from 'vitest'

test('placement-test', async () => {
  const mem = new Map<string, string>()
  const stub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

  const { useUserStore } = await import('../src/store/userStore')
  const { mergeProfileData } = await import('../src/services/sync')
  const { useWordStore, wordsLoaded } = await import('../src/store/wordStore')
  const { difficultyOf } = await import('../src/lib/word-utils')
  await wordsLoaded
  const s = () => useUserStore.getState()

  // ── record is per profile and persisted ──
  assert.equal(s().placement, null)
  s().setPlacement({ date: '2026-11-04', correct: 30, total: 40, estimated: 900 })
  assert.equal(s().placement!.estimated, 900)
  assert.equal(JSON.parse(mem.get('ket-words-user')!).state.placement.correct, 30)
  const kid1 = s().activeProfileId
  s().addProfile('老二')
  assert.equal(s().placement, null)
  s().switchProfile(kid1)
  assert.equal(s().placement!.correct, 30)

  // ── sync keeps the newer test ──
  const base = { dailyGoal: 20, currentSession: null, progress: {}, errorBank: [], dailyLog: {} }
  const older = { date: '2026-10-01', correct: 10, total: 40, estimated: 300 }
  const newer = { date: '2026-11-04', correct: 30, total: 40, estimated: 900 }
  assert.deepEqual(mergeProfileData({ ...base, placement: older }, { ...base, placement: newer }).placement, newer)
  assert.deepEqual(mergeProfileData({ ...base, placement: newer }, { ...base, placement: older }).placement, newer)
  assert.deepEqual(mergeProfileData(base, { ...base, placement: older }).placement, older)
  assert.equal(mergeProfileData(base, base).placement, null)

  // ── the estimate shifts the difficulty mix of new words ──
  const { pickDailyWords } = useWordStore.getState()
  const count = (ws: { word: string }[], d: string) => ws.filter((w) => difficultyOf(w.word) === d).length
  const plain = pickDailyWords(new Set(), 100, new Set())
  const boosted = pickDailyWords(new Set(), 100, new Set(), 1200)
  assert.equal(plain.length, 100)
  assert.equal(boosted.length, 100)
  assert.equal(count(plain, 'easy'), 65, 'no progress → easy-heavy (65%)')
  assert.equal(count(plain, 'hard'), 5)
  assert.ok(count(boosted, 'hard') >= 40, `estimate of 1200 known → hard-heavy, got ${count(boosted, 'hard')}`)
  assert.ok(count(boosted, 'easy') <= 25, `and few easy words, got ${count(boosted, 'easy')}`)

  console.log('✅ placement assertions passed')
})
