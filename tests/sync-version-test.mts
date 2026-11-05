// R01 / R05: versioned profile writes against real SQLite (the migrations
// themselves), and the client sync engine on top of them — a second device
// writing between our pull and push, a failed upload staying unsynced, and a
// change made mid-push getting its own sync.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test, vi } from 'vitest'
import type { ProfileData } from '../src/types'

// D1's prepare/bind/first/run over node:sqlite
function d1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      return {
        bind: (...v: unknown[]) => ({
          first: async () => (stmt.get(...(v as never[])) ?? null) as never,
          run: async () => stmt.run(...(v as never[])),
        }),
      }
    },
  }
}

test('sync-version-test', async () => {
  const db = new DatabaseSync(':memory:')
  for (const f of ['0001_init.sql', '0004_profile_version.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'))
  }
  const addUser = (id: string, token: string) => {
    db.prepare('INSERT INTO users (id, username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, 0)').run(id, id, 'x', '00')
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, id, Date.now())
  }
  addUser('u1', 'tok1')
  addUser('u2', 'tok2')
  addUser('u3', 'tok3')
  const env = { DB: d1(db) } as never

  const { onRequestGet, onRequestPut } = await import('../functions/api/sync/profile')
  const req = (token: string, method: string, body?: unknown) =>
    new Request('https://ket-words.test/api/sync/profile', {
      method,
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const put = async (token: string, body: unknown) => {
    const res = await onRequestPut({ request: req(token, 'PUT', body), env })
    return { status: res.status, body: (await res.json()) as { version?: number; code?: number } }
  }
  const get = async (token: string) =>
    ((await (await onRequestGet({ request: req(token, 'GET'), env })).json()) as {
      profile: { data: ProfileData; version: number } | null
    }).profile

  // ── server: conditional writes ──
  assert.equal(await get('tok1'), null, 'no snapshot yet')
  assert.deepEqual(await put('tok1', { data: { n: 1 }, baseVersion: 0 }), { status: 200, body: { ok: true, version: 1 } }, 'first write creates v1')
  assert.equal((await put('tok1', { data: { n: 2 }, baseVersion: 0 })).status, 409, 'stale base 0 after creation → 409')
  assert.equal((await put('tok1', { data: { n: 2 }, baseVersion: 5 })).status, 409, 'unknown version → 409')
  assert.equal((await put('tok1', { data: { n: 2 }, baseVersion: 1 })).body.version, 2, 'matching base → v2')
  assert.equal((await put('tok1', { data: { n: 3 } })).body.version, 3, 'pre-R01 client (no baseVersion): unconditional, still bumps')
  assert.equal((await put('tok1', { data: { n: 4 }, baseVersion: -1 })).status, 400)
  assert.equal((await put('tok1', { data: { n: 4 }, baseVersion: '3' })).status, 400)
  const p1 = await get('tok1')
  assert.deepEqual([p1?.version, p1?.data], [3, { n: 3 }], 'rejected writes left no trace')

  // A row written before the migration sits at version 0
  db.prepare('INSERT INTO profiles (user_id, data, updated_at) VALUES (?, ?, 0)').run('u2', '{"old":true}')
  assert.equal((await get('tok2'))?.version, 0)
  assert.equal((await put('tok2', { data: { n: 1 }, baseVersion: 0 })).body.version, 1, 'pre-migration row updates from base 0')

  // ── client engine ──
  const mem = new Map<string, string>()
  const stub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: { localStorage: stub, addEventListener: () => {} }, configurable: true })

  let beforePut: (() => Promise<void> | void) | null = null
  let failPuts = 0
  let gets = 0
  let puts = 0
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const request = new Request(`https://ket-words.test${url}`, init)
    if (request.method === 'GET') {
      gets++
      return onRequestGet({ request, env })
    }
    puts++
    const hook = beforePut
    if (hook) await hook()
    if (failPuts > 0) {
      failPuts--
      return new Response('{"error":"boom"}', { status: 500 })
    }
    return onRequestPut({ request, env })
  }) as typeof fetch

  const { syncProfile, hasUnsyncedChanges, startAutoSync, SyncError } = await import('../src/services/sync')
  const { useUserStore } = await import('../src/store/userStore')
  const s = () => useUserStore.getState()
  const kid = s().activeProfileId
  s().setSyncAccount(kid, { username: 'u3', sessionToken: 'tok3', userObjectId: 'u3' })
  const prog = (id: number, ts: number) => ({ wordId: id, status: 'learning' as const, correctCount: 1, wrongCount: 0, lastStudied: ts })
  const snapshot = (ids: number[]): ProfileData => ({
    dailyGoal: 20, currentSession: null, errorBank: [], dailyLog: {},
    progress: Object.fromEntries(ids.map((id) => [id, prog(id, 1000 + id)])),
  })
  const cloudWords = async () => Object.keys((await get('tok3'))!.data.progress).map(Number).sort((a, b) => a - b)

  // The review's race: device B has synced word 2; we learn word 1; while our
  // push is on its way B syncs again with word 3. Before R01 our write
  // silently replaced B's.
  await put('tok3', { data: snapshot([2]), baseVersion: 0 })
  s().updateProgress(1, true)
  beforePut = async () => {
    beforePut = null
    assert.equal((await put('tok3', { data: snapshot([2, 3]), baseVersion: 1 })).status, 200)
  }
  gets = 0
  await syncProfile(kid)
  assert.deepEqual(await cloudWords(), [1, 2, 3], "conflict → re-pull and merge: neither device's word lost")
  assert.equal(gets, 2, 'pulled once more after the 409')
  assert.ok(s().progress[3], 'the other device’s word reached this one too')
  assert.equal(hasUnsyncedChanges(kid), false)
  assert.ok(s().syncAccounts[kid].lastSyncAt)

  // R05: a failed upload stays unsynced and is reported, then goes through
  s().updateProgress(4, true)
  assert.equal(hasUnsyncedChanges(kid), true)
  failPuts = 1
  await assert.rejects(syncProfile(kid))
  assert.equal(hasUnsyncedChanges(kid), true, 'failed push is not recorded as synced')
  assert.ok(s().syncAccounts[kid].lastErrorAt, 'failure surfaced on the account')
  assert.equal(s().syncAccounts[kid].invalid, undefined, 'a server error is not a session problem')
  await syncProfile(kid)
  assert.equal(hasUnsyncedChanges(kid), false)
  assert.equal(s().syncAccounts[kid].lastErrorAt, undefined, 'cleared on success')
  assert.deepEqual(await cloudWords(), [1, 2, 3, 4])

  // Other devices writing every time: give up after a few pulls, report it
  let version = (await get('tok3'))!.version
  beforePut = async () => {
    const r = await put('tok3', { data: snapshot([1, 2, 3, 4]), baseVersion: version })
    version = r.body.version!
  }
  s().updateProgress(5, true)
  gets = 0
  await assert.rejects(syncProfile(kid), (e) => e instanceof SyncError && e.code === 409)
  assert.equal(gets, 3, 'three pulls, then stop')
  assert.ok(s().syncAccounts[kid].lastErrorAt)
  beforePut = null
  await syncProfile(kid)
  assert.deepEqual(await cloudWords(), [1, 2, 3, 4, 5])

  // A change made while a push is in flight gets a sync of its own instead
  // of being dropped by the in-flight guard
  beforePut = async () => {
    beforePut = null
    s().updateProgress(6, true)
    await syncProfile(kid) // returns at once: already syncing
  }
  s().updateProgress(7, true)
  await syncProfile(kid)
  await vi.waitFor(async () => assert.deepEqual(await cloudWords(), [1, 2, 3, 4, 5, 6, 7]))
  await vi.waitFor(() => assert.equal(hasUnsyncedChanges(kid), false))

  // Background engine: a failing server is retried with backoff, not every
  // 3 s — the failure's own status update must not schedule another push
  vi.useFakeTimers()
  try {
    startAutoSync()
    await vi.advanceTimersByTimeAsync(0) // initial pull, nothing to push
    failPuts = 1000
    puts = 0
    s().updateProgress(8, true)
    await vi.advanceTimersByTimeAsync(3000)
    assert.equal(puts, 1, 'debounced push after the change')
    assert.ok(s().syncAccounts[kid].lastErrorAt)
    await vi.advanceTimersByTimeAsync(9000)
    assert.equal(puts, 1, 'no retry storm from the status update')
    await vi.advanceTimersByTimeAsync(1000)
    assert.equal(puts, 2, 'first retry after 10 s')
    await vi.advanceTimersByTimeAsync(29_000)
    assert.equal(puts, 2, 'backing off')
    await vi.advanceTimersByTimeAsync(1000)
    assert.equal(puts, 3, 'then 30 s')
    failPuts = 0
    await vi.advanceTimersByTimeAsync(120_000)
    assert.equal(puts, 4, 'then 2 min, which succeeds')
    assert.equal(s().syncAccounts[kid].lastErrorAt, undefined)
    assert.equal(hasUnsyncedChanges(kid), false)
    await vi.advanceTimersByTimeAsync(3_600_000)
    assert.equal(puts, 4, 'nothing more once synced')
  } finally {
    vi.useRealTimers()
  }
  assert.deepEqual(await cloudWords(), [1, 2, 3, 4, 5, 6, 7, 8])
})
