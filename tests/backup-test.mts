// F9: backup file round-trip, validation, and merge-on-import semantics
import assert from 'node:assert'
import { test } from 'vitest'
import type { ProfileData } from '../src/types'

test('backup-test', async () => {
  const { makeBackup, backupFilename, parseBackup, describeData, BACKUP_APP } = await import('../src/lib/backup')
  const { mergeProfileData } = await import('../src/services/sync')
  const prog = (id: number, status: 'new' | 'learning' | 'mastered', c: number, ts: number) => ({ wordId: id, status, correctCount: c, wrongCount: 0, lastStudied: ts })
  const data: ProfileData = {
    dailyGoal: 30, currentSession: null, dailyLog: { '2026-11-01': 5 }, errorBank: [2, 601],
    progress: { 1: prog(1, 'mastered', 3, 100), 601: prog(601, 'learning', 1, 200) },
    settings: { passScore: 80 }, errorSession: null, placement: null,
  }

  // ── round trip ──
  const b = makeBackup('阿大', data, new Date('2026-11-04T10:00:00Z'))
  assert.equal(b.app, BACKUP_APP)
  assert.equal(b.exportedAt, '2026-11-04T10:00:00.000Z')
  const parsed = parseBackup(JSON.stringify(b))!
  assert.ok(parsed)
  assert.equal(parsed.profileName, '阿大')
  assert.equal(parsed.data.dailyGoal, 30)
  assert.deepEqual(parsed.data.dailyLog, { '2026-11-01': 5 })
  assert.deepEqual(parsed.data.settings, { passScore: 80 })
  // pre-dedupe ids fold into the kept entry on import
  assert.equal(parsed.data.progress[601], undefined)
  assert.equal(parsed.data.progress[572]?.status, 'learning')
  assert.deepEqual(parsed.data.errorBank, [2, 572])

  // ── filename ──
  assert.equal(backupFilename('阿 大/1', new Date(2026, 10, 4)), 'ket-words-阿_大_1-2026-11-04.json')
  assert.equal(backupFilename('', new Date(2026, 0, 9)), 'ket-words-profile-2026-01-09.json')

  // ── rejects anything that isn't a backup ──
  assert.equal(parseBackup('not json'), null)
  assert.equal(parseBackup('{}'), null)
  assert.equal(parseBackup(JSON.stringify({ app: 'other', version: 1, data })), null)
  assert.equal(parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1, data: { progress: 'nope' } })), null)
  // tolerates missing optional fields and drops malformed records
  const loose = parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1, data: { progress: { 5: prog(5, 'learning', 1, 1), x: 'junk', 7: { status: 'new' } } } }))!
  assert.deepEqual(Object.keys(loose.data.progress), ['5'])
  assert.equal(loose.data.dailyGoal, 20)
  assert.deepEqual(loose.data.errorBank, [])
  assert.equal(loose.profileName, '')

  // ── import = merge, never a replace ──
  const local: ProfileData = { ...data, progress: { 1: prog(1, 'learning', 2, 300), 9: prog(9, 'mastered', 3, 50) }, errorBank: [9] }
  const merged = mergeProfileData(local, parsed.data)
  assert.equal(merged.progress[1].status, 'learning', 'newer local record kept')
  assert.equal(merged.progress[9].status, 'mastered', 'local-only word kept')
  assert.equal(merged.progress[572].status, 'learning', 'imported word added')
  assert.deepEqual([...merged.errorBank].sort((a, b) => a - b), [2, 9, 572])

  assert.equal(describeData(parsed.data), '2 个词有记录，其中已掌握 1 个，错题 2 个')
  console.log('✅ backup assertions passed')
})
