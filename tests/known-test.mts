// F2: "already know" enters the review ladder at KNOWN_SRS_LEVEL; reset goes back to new
import assert from 'node:assert'
import { test } from 'vitest'

test('known-test', async () => {
  const mem = new Map<string, string>()
  const stub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

  const { useUserStore, toDateStr, SRS_INTERVALS, KNOWN_SRS_LEVEL } = await import('../src/store/userStore')
  const { mergeProfileData } = await import('../src/services/sync')
  const { wordStatus, dueText } = await import('../src/lib/word-status')
  const s = () => useUserStore.getState()
  const dateStr = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return toDateStr(d) }
  const today = dateStr(0)

  // ── markKnown: fresh, learning, and error-bank words ──
  s().updateProgress(2, false) // learning, in error bank
  s().addToErrorBank(2)
  s().addToErrorBank(3)
  s().markKnown([1, 2])
  for (const id of [1, 2]) {
    const p = s().progress[id]
    assert.equal(p.status, 'mastered')
    assert.equal(p.srsLevel, KNOWN_SRS_LEVEL)
    assert.equal(p.dueDate, dateStr(SRS_INTERVALS[KNOWN_SRS_LEVEL]), 'first review a week out')
    assert.ok(p.correctCount >= 3, 'keeps the mastered invariant')
    assert.equal(p.consecutiveWrong, 0)
  }
  assert.equal(s().progress[2].wrongCount, 1, 'history kept')
  assert.deepEqual(s().errorBank, [3], 'known words leave the error bank')
  assert.equal(wordStatus(s().progress[1], today), 'mastered')
  assert.equal(dueText(s().progress[1], today), `${SRS_INTERVALS[KNOWN_SRS_LEVEL]} 天后复习`)
  assert.ok(!s().getDueReviewIds().includes(1), 'not due yet')

  // ── a word already mastered keeps its own schedule ──
  for (let i = 0; i < 3; i++) s().updateProgress(5, true)
  const before = s().progress[5]
  s().markKnown([5])
  assert.deepEqual(s().progress[5], before)

  // ── resetWords: back to new, counts zeroed, lastStudied fresh ──
  const t0 = Date.now()
  s().resetWords([1])
  const r = s().progress[1]
  assert.equal(r.status, 'new')
  assert.equal(r.correctCount, 0)
  assert.equal(r.wrongCount, 0)
  assert.equal(r.dueDate, undefined)
  assert.ok(r.lastStudied >= t0)
  assert.equal(wordStatus(r, today), 'new')
  assert.ok(!s().getMasteredIds().has(1))
  // a reset record still behaves as a brand-new word for later answers
  s().updateProgress(1, true)
  assert.equal(s().progress[1].status, 'learning')

  // ── sync: the fresh "new" record beats an older mastered one from the cloud ──
  const local = s().getProfileData(s().activeProfileId)!
  const remote = { ...local, progress: { 1: { ...before, wordId: 1, lastStudied: t0 - 1000 } } }
  const merged = mergeProfileData(local, remote)
  assert.equal(merged.progress[1].status, 'learning', 'local newer record wins over the stale cloud one')

  // ── status helper edge cases ──
  assert.equal(wordStatus(undefined, today), 'new')
  assert.equal(wordStatus({ wordId: 9, status: 'mastered', correctCount: 3, wrongCount: 0, lastStudied: 0 }, today), 'due', 'pre-SRS record counts as due')
  assert.equal(wordStatus({ wordId: 9, status: 'mastered', correctCount: 3, wrongCount: 0, lastStudied: 0, dueDate: null }, today), 'graduated')
  assert.equal(dueText({ wordId: 9, status: 'mastered', correctCount: 3, wrongCount: 0, lastStudied: 0, dueDate: dateStr(1) }, today), '明天复习')
  assert.equal(dueText(undefined, today), null)

  console.log('✅ known/reset assertions passed')
})
