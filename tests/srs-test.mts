// SRS logic test — runs updateProgress/getDueReviewIds against the real store
import assert from 'node:assert'

// zustand v5 persist reads window.localStorage — stub both for Node
const mem = new Map<string, string>()
const stub = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}
Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

const { useUserStore } = await import(
  '../src/store/userStore'
)

const s = () => useUserStore.getState()
const dateStr = (offsetDays: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
const patch = (id: number, fields: object) =>
  useUserStore.setState((st: any) => ({
    progress: { ...st.progress, [id]: { ...st.progress[id], ...fields } },
  }))

// 1. Learning phase: 2 corrects → still learning, no due date scheduling
s().updateProgress(1, true)
s().updateProgress(1, true)
assert.equal(s().progress[1].status, 'learning')

// 2. Third correct → mastered, srsLevel 0, due tomorrow
s().updateProgress(1, true)
let p = s().progress[1]
assert.equal(p.status, 'mastered')
assert.equal(p.srsLevel, 0)
assert.equal(p.dueDate, dateStr(1))
assert.deepEqual(s().getDueReviewIds(), [], 'not due yet today')

// 3. Early correct answer (not due) must NOT advance the schedule
s().updateProgress(1, true)
p = s().progress[1]
assert.equal(p.srsLevel, 0)
assert.equal(p.dueDate, dateStr(1), 'early correct left schedule unchanged')

// 4. Once due, correct advances level 0 → 1, next review in 3 days
patch(1, { dueDate: dateStr(-1) })
assert.deepEqual(s().getDueReviewIds(), [1], 'overdue word is due')
s().updateProgress(1, true)
p = s().progress[1]
assert.equal(p.srsLevel, 1)
assert.equal(p.dueDate, dateStr(3))

// 5. Wrong answer on a mastered word resets to level 0, due tomorrow, stays mastered
s().updateProgress(1, false)
p = s().progress[1]
assert.equal(p.status, 'mastered')
assert.equal(p.srsLevel, 0)
assert.equal(p.dueDate, dateStr(1))

// 6. Passing the last (30-day) review graduates the word
patch(1, { srsLevel: 4, dueDate: dateStr(-2) })
s().updateProgress(1, true)
p = s().progress[1]
assert.equal(p.dueDate, null, 'graduated')
assert.deepEqual(s().getDueReviewIds(), [], 'graduated word never due again')

// 7. Legacy record (mastered before SRS existed, no dueDate) counts as due today
patch(2, { wordId: 2, status: 'mastered', correctCount: 3, wrongCount: 0, lastStudied: 0 })
assert.deepEqual(s().getDueReviewIds(), [2])

// 8. Due list sorts most-overdue first (legacy/undefined first)
patch(3, { wordId: 3, status: 'mastered', correctCount: 3, wrongCount: 0, lastStudied: 0, srsLevel: 0, dueDate: dateStr(-5) })
patch(4, { wordId: 4, status: 'mastered', correctCount: 3, wrongCount: 0, lastStudied: 0, srsLevel: 0, dueDate: dateStr(-1) })
assert.deepEqual(s().getDueReviewIds(), [2, 3, 4])

console.log('✅ all SRS assertions passed')
