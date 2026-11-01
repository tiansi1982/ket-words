// R3: duplicate word ids removed from the dictionary fold into the kept id —
// in the pure remap, in the persist v3 migration, and in the sync merge
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

const prog = (wordId: number, status: 'new' | 'learning' | 'mastered', correctCount: number, lastStudied: number) => ({
  wordId, status, correctCount, wrongCount: 0, lastStudied,
})

// Seed a v2 snapshot: active profile uses old ids, stashed profile too
mem.set(
  'ket-words-user',
  JSON.stringify({
    version: 2,
    state: {
      activeProfileId: 'kid-a',
      profileList: [{ id: 'kid-a', name: '阿大' }, { id: 'kid-b', name: '阿二' }],
      syncAccounts: {},
      dailyGoal: 20,
      currentSession: { date: '2026-01-01', wordIds: [601, 572, 7], currentIndex: 2, completed: false },
      progress: {
        601: prog(601, 'mastered', 3, 100), // goat under the removed id
        572: prog(572, 'learning', 1, 200), // goat under the kept id, studied later
        7: prog(7, 'learning', 1, 50),
      },
      errorBank: [601, 572, 7, 618],
      dailyLog: {},
      profileData: {
        'kid-b': { dailyGoal: 10, currentSession: null, progress: { 645: prog(645, 'learning', 2, 10) }, errorBank: [645], dailyLog: {} },
      },
    },
  })
)

const { WORD_ALIASES, canonicalWordId, remapProfileData } = await import('../src/lib/word-aliases')
const { useUserStore } = await import('../src/store/userStore')
const { mergeProfileData } = await import('../src/services/sync')
const { useWordStore, wordsLoaded } = await import('../src/store/wordStore')
await wordsLoaded

// ── alias table is consistent with the dictionary ──
const { getWord, words } = useWordStore.getState()
assert.equal(words.length, 1574, 'duplicates gone from the word list')
for (const [removed, kept] of Object.entries(WORD_ALIASES)) {
  assert.equal(getWord(Number(removed)), undefined, `removed id ${removed} no longer in the dictionary`)
  assert.ok(getWord(kept), `kept id ${kept} exists`)
}
assert.equal(canonicalWordId(601), 572)
assert.equal(canonicalWordId(1), 1)
// no two entries share spelling + part of speech any more
const seen = new Set<string>()
for (const w of words) {
  const key = `${w.word}|${w.pos}`
  assert.ok(!seen.has(key), `duplicate entry ${key}`)
  seen.add(key)
}

// ── pure remap ──
{
  const data: ProfileData = {
    dailyGoal: 20,
    currentSession: { date: '2026-01-01', wordIds: [601, 572, 7], currentIndex: 2, completed: false },
    progress: { 601: prog(601, 'mastered', 3, 100), 572: prog(572, 'learning', 1, 200), 7: prog(7, 'learning', 1, 50) },
    errorBank: [601, 572, 7, 618],
    dailyLog: {},
  }
  const out = remapProfileData(data)
  assert.notStrictEqual(out, data)
  assert.deepEqual(Object.keys(out.progress).map(Number).sort((a, b) => a - b), [7, 572])
  assert.equal(out.progress[572].status, 'mastered', 'mastered record wins over learning, even if older')
  assert.equal(out.progress[572].wordId, 572, 'wordId rewritten to the kept id')
  assert.deepEqual(out.errorBank, [572, 7, 582], 'error bank remapped and deduped, order kept')
  assert.deepEqual(out.currentSession!.wordIds, [572, 7])
  assert.equal(out.currentSession!.currentIndex, 1, 'cursor still on word 7')
}
{
  // equal status → the more recently studied record wins
  const out = remapProfileData({
    dailyGoal: 20, currentSession: null, dailyLog: {}, errorBank: [],
    progress: { 601: prog(601, 'learning', 2, 300), 572: prog(572, 'learning', 1, 200) },
  })
  assert.equal(out.progress[572].correctCount, 2)
}
{
  // nothing aliased → identical object back
  const data: ProfileData = { dailyGoal: 20, currentSession: null, dailyLog: {}, errorBank: [1, 2], progress: { 1: prog(1, 'new', 0, 0) } }
  assert.strictEqual(remapProfileData(data), data)
}

// ── persist migration v2 → v3 ──
const s = useUserStore.getState()
assert.equal(s.progress[601], undefined, 'old id gone from active profile')
assert.equal(s.progress[572].status, 'mastered')
assert.deepEqual(s.errorBank, [572, 7, 582])
assert.deepEqual(s.currentSession!.wordIds, [572, 7])
assert.equal(s.currentSession!.currentIndex, 1)
assert.deepEqual(s.profileData['kid-b'].errorBank, [600], 'stashed profile remapped too')
assert.equal(s.profileData['kid-b'].progress[600].correctCount, 2)
assert.equal(s.profileData['kid-b'].progress[645], undefined)

// ── sync merge normalises a cloud snapshot written by an older client ──
{
  const local: ProfileData = { dailyGoal: 20, currentSession: null, dailyLog: {}, errorBank: [], progress: { 572: prog(572, 'learning', 1, 100) } }
  const remote: ProfileData = { dailyGoal: 20, currentSession: null, dailyLog: {}, errorBank: [618], progress: { 601: prog(601, 'mastered', 3, 50) } }
  const merged = mergeProfileData(local, remote)
  assert.equal(merged.progress[601], undefined)
  assert.equal(merged.progress[572].status, 'learning', 'per-word merge still prefers the newer record')
  assert.deepEqual(merged.errorBank, [582])
}

console.log('✅ word-alias assertions passed')
