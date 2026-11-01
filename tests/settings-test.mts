// R10: per-profile settings with defaults, parent PIN, sync merge of settings
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

const { resolveSettings, isValidPin, DEFAULT_SETTINGS } = await import('../src/lib/settings')
const { useUserStore } = await import('../src/store/userStore')
const { mergeProfileData } = await import('../src/services/sync')
const s = () => useUserStore.getState()

// ── resolveSettings: defaults, clamping, legacy shapes ──
assert.deepEqual(resolveSettings(undefined), DEFAULT_SETTINGS)
assert.deepEqual(resolveSettings({}), DEFAULT_SETTINGS)
assert.equal(resolveSettings({ passScore: 80 }).passScore, 80)
assert.equal(resolveSettings({ passScore: 30 }).passScore, 60, 'clamped to minimum')
assert.equal(resolveSettings({ passScore: 120 }).passScore, 100, 'clamped to maximum')
assert.equal(resolveSettings({ passScore: Number.NaN }).passScore, 90, 'garbage → default')
assert.equal(resolveSettings({ autoSpeak: false }).autoSpeak, false)
assert.equal(resolveSettings({ passScore: 80 }).autoSpeak, true, 'missing key keeps default')

// ── isValidPin ──
assert.ok(isValidPin('1234'))
assert.ok(!isValidPin('123'))
assert.ok(!isValidPin('12345'))
assert.ok(!isValidPin('12a4'))

// ── store: settings are per profile, pin is per device ──
assert.deepEqual(s().settings, {}, 'fresh profile stores no overrides')
assert.equal(s().parentPin, null)
s().updateSettings({ passScore: 80 })
s().updateSettings({ autoSpeak: false })
assert.deepEqual(s().settings, { passScore: 80, autoSpeak: false }, 'patches merge')
s().setParentPin('2468')
const kid1 = s().activeProfileId
s().addProfile('老二')
assert.deepEqual(s().settings, {}, 'new profile starts from defaults')
assert.equal(s().parentPin, '2468', 'PIN is not per profile')
s().switchProfile(kid1)
assert.deepEqual(s().settings, { passScore: 80, autoSpeak: false }, 'settings restored with the profile')
const persisted = JSON.parse(mem.get('ket-words-user')!)
assert.equal(persisted.state.parentPin, '2468')
assert.deepEqual(persisted.state.settings, { passScore: 80, autoSpeak: false })
s().setParentPin(null)
assert.equal(s().parentPin, null)

// ── sync merge: local keys win, remote fills gaps; legacy snapshots without settings ──
const base = (over: Partial<ProfileData>): ProfileData => ({
  dailyGoal: 20, currentSession: null, progress: {}, errorBank: [], dailyLog: {}, ...over,
})
assert.deepEqual(
  mergeProfileData(base({ settings: { passScore: 80 } }), base({ settings: { passScore: 70, autoSpeak: false } })).settings,
  { passScore: 80, autoSpeak: false }
)
assert.deepEqual(mergeProfileData(base({}), base({ settings: { passScore: 75 } })).settings, { passScore: 75 })
assert.deepEqual(mergeProfileData(base({}), base({})).settings, {})

console.log('✅ settings assertions passed')
