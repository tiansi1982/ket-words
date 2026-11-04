// F6/F8: streak grace, daily correct counts, masteredAt, speak pass counts,
// weekly summary, badges and the seen list (store + merge)
import assert from 'node:assert'
import { test } from 'vitest'
import type { ProfileData } from '../src/types'

test('weekly-achievements-test', async () => {
  const mem = new Map<string, string>()
  const stub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

  const { useUserStore, toDateStr } = await import('../src/store/userStore')
  const { mergeProfileData } = await import('../src/services/sync')
  const { summarizeWeek, weekStart, hardestWords } = await import('../src/lib/weekly')
  const { ACHIEVEMENTS, achievementInput, earnedAchievements } = await import('../src/lib/achievements')
  const s = () => useUserStore.getState()
  const dateStr = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return toDateStr(d) }

  // ── streak: one missed day per month is forgiven, but not at the start ──
  useUserStore.setState({ dailyLog: { [dateStr(-1)]: 5, [dateStr(-3)]: 2 } })
  assert.equal(s().getStreak(), 2, 'a single gap is bridged')
  useUserStore.setState({ dailyLog: { [dateStr(-1)]: 5, [dateStr(-3)]: 2, [dateStr(-5)]: 1 } })
  const twoGaps = s().getStreak()
  // both gaps in the same month → only the first is forgiven; across a month boundary both are
  const sameMonth = dateStr(-2).slice(0, 7) === dateStr(-4).slice(0, 7)
  assert.equal(twoGaps, sameMonth ? 2 : 3)
  useUserStore.setState({ dailyLog: { [dateStr(-3)]: 2 } })
  assert.equal(s().getStreak(), 0, 'yesterday and the day before missing → no streak (grace cannot start one)')
  useUserStore.setState({ dailyLog: { [dateStr(0)]: 1, [dateStr(-1)]: 1 } })
  assert.equal(s().getStreak(), 2)

  // ── dailyRight, masteredAt, speakPassCount ──
  useUserStore.setState({ dailyLog: {}, dailyRight: {}, progress: {}, errorBank: [] })
  const t0 = Date.now()
  s().updateProgress(1, true)
  s().updateProgress(1, false)
  s().updateProgress(1, true)
  s().updateProgress(1, true)
  assert.equal(s().dailyLog[dateStr(0)], 4)
  assert.equal(s().dailyRight![dateStr(0)], 3)
  assert.equal(s().progress[1].status, 'mastered')
  assert.ok((s().progress[1].masteredAt ?? 0) >= t0, 'masteredAt stamped when the word is mastered')
  const stamp = s().progress[1].masteredAt
  s().updateProgress(1, true)
  assert.equal(s().progress[1].masteredAt, stamp, 'not re-stamped afterwards')
  s().markKnown([2])
  assert.ok((s().progress[2].masteredAt ?? 0) >= t0, 'markKnown stamps too')
  s().recordSpeak(1, 95, true)
  s().recordSpeak(1, 60, false)
  s().recordSpeak(1, 92, true)
  assert.equal(s().progress[1].speakPassCount, 2)
  assert.equal(s().progress[1].speakFailCount, 1)

  // ── weekly summary ──
  const monday = weekStart(new Date())
  assert.equal(monday.getDay(), 1)
  const thisWeek = summarizeWeek(s().getProfileData(s().activeProfileId)!, monday)
  assert.equal(thisWeek.answers, 5)
  assert.equal(thisWeek.right, 4)
  assert.equal(thisWeek.accuracy, 80)
  assert.equal(thisWeek.days, 1)
  assert.equal(thisWeek.mastered, 2)
  assert.equal(thisWeek.speakAvg, 92, 'last read-aloud score of words studied this week')
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7)
  const lastWeek = summarizeWeek(s().getProfileData(s().activeProfileId)!, lastMonday)
  assert.equal(lastWeek.answers, 0)
  assert.equal(lastWeek.accuracy, null)
  assert.equal(lastWeek.mastered, 0)
  const empty = summarizeWeek({ dailyGoal: 20, currentSession: null, progress: {}, errorBank: [], dailyLog: {} }, monday)
  assert.equal(empty.speakAvg, null)
  assert.equal(empty.days, 0)

  // ── hardest words: by consecutive misses, then misses ──
  s().addToErrorBank(5); s().addToErrorBank(6); s().addToErrorBank(7)
  s().updateProgress(6, false); s().updateProgress(6, false)
  s().updateProgress(7, false)
  s().updateProgress(5, false); s().updateProgress(5, true); s().updateProgress(5, false); s().updateProgress(5, true); s().updateProgress(5, false)
  assert.deepEqual(hardestWords(s().getProfileData(s().activeProfileId)!, 2), [6, 5])

  // ── achievements ──
  const base = (over: Partial<ProfileData>): ProfileData => ({ dailyGoal: 20, currentSession: null, progress: {}, errorBank: [], dailyLog: {}, ...over })
  const none = earnedAchievements(achievementInput(base({}), 0, 1574))
  assert.deepEqual(none, [])
  const prog = (id: number, status: 'mastered' | 'learning', extra: object = {}) => ({ wordId: id, status, correctCount: 3, wrongCount: 1, lastStudied: 0, ...extra })
  const progress: ProfileData['progress'] = {}
  for (let i = 1; i <= 60; i++) progress[i] = prog(i, 'mastered', i <= 10 ? { dueDate: null } : {})
  progress[1] = { ...progress[1], speakPassCount: 50 }
  const rich = base({ progress, dailyLog: { '2026-11-01': 55 }, placement: { date: '2026-11-01', correct: 1, total: 1, estimated: 1 }, errorBank: [] })
  const earned = earnedAchievements(achievementInput(rich, 7, 1574))
  assert.deepEqual(earned.sort(), ['day_50', 'errorbank_zero', 'mastered_50', 'placement', 'speak_50', 'streak_3', 'streak_7'].sort())
  const inp = achievementInput(rich, 7, 1574)
  assert.deepEqual(ACHIEVEMENTS.find((a) => a.id === 'mastered_200')!.progress(inp), { value: 60, target: 200 })
  assert.deepEqual(ACHIEVEMENTS.find((a) => a.id === 'mastered_all')!.progress(inp), { value: 60, target: 1574 })
  assert.equal(earnedAchievements(achievementInput(base({ errorBank: [] }), 0, 1574)).includes('errorbank_zero'), false, 'never made a mistake → not "cleared"')
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length, 'ids unique')

  // ── seen list: per profile, merged as a union ──
  s().markAchievementsSeen(['streak_3', 'streak_7'])
  s().markAchievementsSeen(['streak_3'])
  assert.deepEqual(s().achievementsSeen, ['streak_3', 'streak_7'])
  const merged = mergeProfileData(base({ achievementsSeen: ['a'], dailyRight: { d: 2 } }), base({ achievementsSeen: ['b'], dailyRight: { d: 5, e: 1 } }))
  assert.deepEqual(merged.achievementsSeen!.sort(), ['a', 'b'])
  assert.deepEqual(merged.dailyRight, { d: 5, e: 1 })
  assert.deepEqual(mergeProfileData(base({}), base({})).achievementsSeen, [])

  console.log('✅ weekly / achievements assertions passed')
})
