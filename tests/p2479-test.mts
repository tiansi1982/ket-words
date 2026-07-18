import assert from 'node:assert'

const mem = new Map<string, string>()
const stub = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}
Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

const { useUserStore, toDateStr } = await import('../src/store/userStore')
const { useWordStore } = await import('../src/store/wordStore')
const s = () => useUserStore.getState()
const dateStr = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return toDateStr(d) }

// ── P7: consecutiveWrong tracks wrong-in-a-row, resets on correct ──
s().updateProgress(1, false)
s().updateProgress(1, false)
assert.equal(s().progress[1].consecutiveWrong, 2, 'two wrongs → hint threshold')
s().updateProgress(1, true)
assert.equal(s().progress[1].consecutiveWrong, 0, 'correct resets')

// ── P4: dailyLog counts today's answers; streak logic ──
assert.equal(s().dailyLog[dateStr(0)], 3, 'three answers logged today')
assert.equal(s().getStreak(), 1, 'streak = 1 (today only)')
useUserStore.setState({ dailyLog: { [dateStr(-1)]: 5, [dateStr(-2)]: 2 } })
assert.equal(s().getStreak(), 2, 'no study today yet → yesterday streak still alive')
useUserStore.setState({ dailyLog: { [dateStr(-1)]: 5, [dateStr(-3)]: 2 } })
assert.equal(s().getStreak(), 1, 'gap breaks the streak')
useUserStore.setState({ dailyLog: {} })
assert.equal(s().getStreak(), 0)

// ── P4: dailyLog is per-profile ──
s().updateProgress(2, true)
assert.equal(s().dailyLog[dateStr(0)], 1)
s().addProfile('第二个')
assert.equal(s().dailyLog[dateStr(0)] ?? 0, 0, 'new profile starts with empty log')
const kid2 = s().activeProfileId
s().switchProfile(s().profileList[0].id)
assert.equal(s().dailyLog[dateStr(0)], 1, 'first profile log restored')
assert.deepEqual(s().profileData[kid2].dailyLog, {}, 'stash carries dailyLog')

// ── P2: learning words claim daily slots before new words ──
const { pickDailyWords } = useWordStore.getState()
const learningIds = new Set([10, 20, 30])
const masteredIds = new Set([40, 50])
const picked = pickDailyWords(masteredIds, 10, learningIds)
assert.equal(picked.length, 10)
const pickedIds = new Set(picked.map((w: any) => w.id))
for (const id of learningIds) assert.ok(pickedIds.has(id), `learning word ${id} included`)
for (const id of masteredIds) assert.ok(!pickedIds.has(id), 'mastered excluded')
// more learning words than the goal → capped at goal, no new words
const manyLearning = new Set(Array.from({ length: 30 }, (_, i) => i + 1))
const picked2 = pickDailyWords(new Set(), 10, manyLearning)
assert.equal(picked2.length, 10)
assert.ok(picked2.every((w: any) => manyLearning.has(w.id)), 'all slots go to learning words')

console.log('✅ P2/P4/P7 assertions passed')
