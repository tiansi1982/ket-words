// Profile switching + v0→v1 migration test against the real store
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

// Seed pre-profile (v0) data: one kid already has progress
mem.set(
  'ket-words-user',
  JSON.stringify({
    state: {
      userId: null,
      dailyGoal: 30,
      currentSession: null,
      progress: {
        7: { wordId: 7, status: 'mastered', correctCount: 3, wrongCount: 1, lastStudied: 123 },
      },
      errorBank: [7],
    },
    version: 0,
  })
)

const { useUserStore } = await import(
  '../src/store/userStore'
)
const s = () => useUserStore.getState()

// 1. Migration: v0 data became the first profile, data intact
assert.equal(s().profileList.length, 1)
assert.equal(s().profileList[0].name, '孩子 1')
assert.equal(s().activeProfileId, s().profileList[0].id)
assert.equal(s().dailyGoal, 30, 'migrated dailyGoal preserved')
assert.equal(s().progress[7].status, 'mastered')
assert.deepEqual(s().errorBank, [7])
const kid1 = s().activeProfileId

// 2. Add a second kid: becomes active with fresh data
s().addProfile('小妹')
assert.equal(s().profileList.length, 2)
const kid2 = s().activeProfileId
assert.notEqual(kid2, kid1)
assert.equal(s().profileList[1].name, '小妹')
assert.equal(s().dailyGoal, 20, 'new profile starts with defaults')
assert.deepEqual(s().progress, {})
assert.deepEqual(s().errorBank, [])

// 3. Second kid learns a word — must not touch kid1's stash
s().updateProgress(42, true)
assert.equal(s().progress[42].correctCount, 1)
assert.equal(s().profileData[kid1].progress[7].correctCount, 3)

// 4. Switch back to kid1: their data restored, kid2's stashed
s().switchProfile(kid1)
assert.equal(s().activeProfileId, kid1)
assert.equal(s().dailyGoal, 30)
assert.equal(s().progress[7].wrongCount, 1)
assert.equal(s().progress[42], undefined, 'kid2 progress not visible')
assert.equal(s().profileData[kid2].progress[42].correctCount, 1)
assert.equal(s().profileData[kid1], undefined, 'active profile not duplicated in stash')

// 5. Switching to the already-active profile is a no-op
const before = s()
s().switchProfile(kid1)
assert.equal(s().progress, before.progress)

// 6. Rename
s().renameProfile(kid2, '妹妹')
assert.equal(s().profileList.find((p: any) => p.id === kid2)!.name, '妹妹')

// 7. Deleting the last remaining profile is refused; deleting active switches away
s().deleteProfile(kid1) // delete active → kid2 (妹妹) becomes active
assert.equal(s().activeProfileId, kid2)
assert.equal(s().progress[42].correctCount, 1, 'kid2 data restored on activation')
assert.equal(s().profileList.length, 1)
s().deleteProfile(kid2)
assert.equal(s().profileList.length, 1, 'last profile cannot be deleted')

// 8. Persisted JSON carries the current version and round-trips
const persisted = JSON.parse(mem.get('ket-words-user')!)
assert.equal(persisted.version, 2)
assert.equal(persisted.state.profileList.length, 1)

console.log('✅ all profile assertions passed')
