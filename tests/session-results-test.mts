// R14: recordSpeak tracks the speaking side without touching counts or SRS
import assert from 'node:assert'

const mem = new Map<string, string>()
const stub = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}
Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

const { useUserStore } = await import('../src/store/userStore')
const s = () => useUserStore.getState()

// ── recordSpeak ──
s().recordSpeak(5, 95, true)
assert.equal(s().progress[5].lastSpeakScore, 95)
assert.equal(s().progress[5].speakFailCount, 0)
assert.equal(s().progress[5].correctCount, 0, 'no answer counted')
assert.equal(s().progress[5].status, 'new', 'status untouched')
assert.deepEqual(s().dailyLog, {}, 'not an answer for the daily log')

s().recordSpeak(5, 72, false)
s().recordSpeak(5, null, false) // skipped
assert.equal(s().progress[5].speakFailCount, 2)
assert.equal(s().progress[5].lastSpeakScore, null)
assert.equal(s().progress[5].wrongCount, 0, 'the miss itself is recorded by updateProgress, not here')

// pairing with updateProgress keeps SRS semantics: a mastered word that fails
// the read-aloud is reset by updateProgress(false), not by recordSpeak
s().updateProgress(6, true); s().updateProgress(6, true); s().updateProgress(6, true)
assert.equal(s().progress[6].status, 'mastered')
const due = s().progress[6].dueDate
s().recordSpeak(6, 60, false)
assert.equal(s().progress[6].dueDate, due, 'recordSpeak alone leaves the schedule')
s().updateProgress(6, false)
assert.equal(s().progress[6].srsLevel, 0)

console.log('✅ session result assertions passed')

// ── recordSessionResult (R7): per-word results merge into today's session ──
s().startDailySession([1, 2])
s().recordSessionResult(1, { speak: 'failed', speakScore: 70 })
s().recordSessionResult(1, { spelled: true })
assert.deepEqual(s().currentSession!.results, { 1: { speak: 'failed', speakScore: 70, spelled: true } }, 'patches merge per word')
s().recordSessionResult(2, { speak: 'skipped', speakScore: null })
s().recordSessionResult(2, { spelled: false })
assert.deepEqual(s().currentSession!.results![2], { speak: 'skipped', speakScore: null, spelled: false })
s().advanceSession()
assert.ok(s().currentSession!.results, 'advancing keeps results')
useUserStore.setState({ currentSession: null })
s().recordSessionResult(1, { spelled: true })
assert.equal(s().currentSession, null, 'no session → no-op')

console.log('✅ session summary assertions passed')
