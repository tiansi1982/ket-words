// R1: /api/soe-url only signs for a known principal, only for our own example
// sentences, and within a daily budget; /api/device mints anonymous tokens.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'vitest'

test('soe-quota-test', async () => {

// ── minimal in-memory D1 covering the statements these functions use ──
class FakeD1 {
  sessions = new Map<string, string>() // token → user_id
  devices = new Set<string>()
  quota = new Map<string, number>() // `${key}|${day}` → count
  prepare(sql: string) {
    const self = this
    return {
      bind(...v: unknown[]) {
        return {
          async first<T>(): Promise<T | null> {
            if (sql.includes('FROM sessions')) {
              const u = self.sessions.get(v[0] as string)
              return (u ? { user_id: u } : null) as T
            }
            if (sql.includes('FROM devices')) return (self.devices.has(v[0] as string) ? { token: v[0] } : null) as T
            if (sql.includes('INSERT INTO soe_quota')) {
              const k = `${v[0]}|${v[1]}`
              const n = (self.quota.get(k) ?? 0) + 1
              self.quota.set(k, n)
              return { count: n } as T
            }
            throw new Error('unexpected first(): ' + sql)
          },
          async run() {
            if (sql.includes('INSERT INTO devices')) return void self.devices.add(v[0] as string)
            if (sql.includes('DELETE FROM soe_quota')) {
              for (const k of [...self.quota.keys()]) if (k.split('|')[1] < (v[0] as string)) self.quota.delete(k)
              return
            }
            throw new Error('unexpected run(): ' + sql)
          },
        }
      },
    }
  }
}

const { onRequestPost: soeUrl } = await import('../functions/api/soe-url')
const { onRequestPost: mintDevice } = await import('../functions/api/device')
const { quotaDay, daysAgo, bumpQuota, purgeQuotaBefore } = await import('../functions/api/_quota')
const words = JSON.parse(readFileSync(new URL('../src/data/ket-words.json', import.meta.url), 'utf8')) as { example: string }[]
const EXAMPLE = words[0].example

const post = (path: string, body: unknown, headers: Record<string, string> = {}, ip = '1.2.3.4') =>
  new Request(`https://ket-words.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, ...headers },
    body: JSON.stringify(body),
  })
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` })
const soeEnv = { SOE_APP_ID: '1300000000', SOE_SECRET_ID: 'AKIDtest', SOE_SECRET_KEY: 'secretkeytest' }
const callSoe = (env: object, body: unknown, headers?: Record<string, string>, ip?: string) =>
  soeUrl({ request: post('/api/soe-url', body, headers, ip), env: env as never })
const mint = async (env: object, ip?: string) => {
  const res = await mintDevice({ request: post('/api/device', {}, {}, ip), env: env as never })
  return { status: res.status, token: ((await res.json()) as { token?: string }).token }
}

// ── configuration guards ──
{
  const db = new FakeD1()
  assert.equal((await callSoe({ DB: db }, { refText: EXAMPLE })).status, 501, 'no SOE secrets → 501')
  assert.equal((await callSoe(soeEnv, { refText: EXAMPLE })).status, 500, 'no D1 → fail closed')
}

// ── auth + refText + happy path ──
{
  const db = new FakeD1()
  const env = { ...soeEnv, DB: db }
  assert.equal((await callSoe(env, { refText: EXAMPLE })).status, 401, 'no token → 401')
  assert.equal((await callSoe(env, { refText: EXAMPLE }, bearer('nope'))).status, 401, 'unknown token → 401')

  const { status, token } = await mint(env)
  assert.equal(status, 200)
  assert.ok(token && /^[0-9a-f]{64}$/.test(token), 'device token is 32 random bytes hex')

  assert.equal((await callSoe(env, { refText: 'Hello there, general.' }, bearer(token!))).status, 400, 'not one of our examples → 400')
  assert.equal((await callSoe(env, { refText: EXAMPLE.slice(0, -1) }, bearer(token!))).status, 400, 'near miss → 400')
  assert.equal((await callSoe(env, {}, bearer(token!))).status, 400)

  const ok = await callSoe(env, { refText: ` ${EXAMPLE} ` }, bearer(token!))
  assert.equal(ok.status, 200, 'device token + known sentence (whitespace tolerated) → signed')
  const { url } = (await ok.json()) as { url: string }
  assert.equal(new URL(url).searchParams.get('ref_text'), EXAMPLE)
  const day = quotaDay()
  assert.equal(db.quota.get(`d:${token}|${day}`), 1, 'counted against the device')
  assert.equal(db.quota.get(`ip:1.2.3.4|${day}`), 1, 'and against the source IP')
}

// ── sync session as principal ──
{
  const db = new FakeD1()
  db.sessions.set('sess-1', 'user-1')
  const env = { ...soeEnv, DB: db }
  assert.equal((await callSoe(env, { refText: EXAMPLE }, bearer('sess-1'))).status, 200)
  assert.equal(db.quota.get(`u:user-1|${quotaDay()}`), 1, 'counted against the account')
}

// ── per-principal daily limit ──
{
  const db = new FakeD1()
  const env = { ...soeEnv, DB: db, SOE_DAILY_LIMIT: '2' }
  const { token } = await mint(env)
  assert.equal((await callSoe(env, { refText: EXAMPLE }, bearer(token!))).status, 200)
  assert.equal((await callSoe(env, { refText: EXAMPLE }, bearer(token!))).status, 200)
  const over = await callSoe(env, { refText: EXAMPLE }, bearer(token!))
  assert.equal(over.status, 429, 'third call of the day → 429')
  assert.deepEqual(await over.json(), { code: 429, error: 'daily quota exceeded', limit: 2 })
}

// ── per-IP daily limit spans principals ──
{
  const db = new FakeD1()
  const env = { ...soeEnv, DB: db, SOE_IP_DAILY_LIMIT: '1' }
  const a = (await mint(env)).token!
  const b = (await mint(env)).token!
  assert.equal((await callSoe(env, { refText: EXAMPLE }, bearer(a))).status, 200)
  const over = await callSoe(env, { refText: EXAMPLE }, bearer(b))
  assert.equal(over.status, 429, 'same IP, different device → 429')
  assert.equal(((await over.json()) as { limit: number }).limit, 1)
  assert.equal((await callSoe(env, { refText: EXAMPLE }, bearer(b), '5.6.7.8')).status, 200, 'other IP unaffected')
}

// ── device minting is rate limited per IP ──
{
  const db = new FakeD1()
  const env = { DB: db, SOE_DEVICE_IP_DAILY_LIMIT: '1' }
  assert.equal((await mint(env)).status, 200)
  assert.equal((await mint(env)).status, 429)
  assert.equal((await mint(env, '9.9.9.9')).status, 200)
  assert.equal((await mintDevice({ request: post('/api/device', {}), env: {} as never })).status, 500, 'no D1 → 500')
}

// ── day boundary + purge helpers ──
assert.equal(quotaDay(new Date('2026-01-01T17:00:00Z')), '2026-01-02', 'resets at Beijing midnight, not UTC')
assert.equal(quotaDay(new Date('2026-01-01T15:59:00Z')), '2026-01-01')
assert.equal(quotaDay(new Date('2026-01-01T12:00:00Z'), 'UTC'), '2026-01-01', 'timezone override')
assert.equal(daysAgo(7, new Date('2026-01-10T00:00:00Z')), '2026-01-03')
{
  const db = new FakeD1()
  await bumpQuota(db, 'k', '2026-01-01')
  await bumpQuota(db, 'k', '2026-01-09')
  await purgeQuotaBefore(db, '2026-01-03')
  assert.deepEqual([...db.quota.keys()], ['k|2026-01-09'])
}

// ── client: device token is minted once, cached, and re-minted after clear ──
{
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    },
    configurable: true,
  })
  let calls = 0
  globalThis.fetch = (async () => new Response(JSON.stringify({ token: `tok-${++calls}` }))) as typeof fetch
  const { getDeviceToken, cachedDeviceToken, clearDeviceToken } = await import('../src/services/device')
  const [a, b] = await Promise.all([getDeviceToken(), getDeviceToken()])
  assert.equal(a, 'tok-1')
  assert.equal(b, 'tok-1', 'concurrent callers share one request')
  assert.equal(calls, 1)
  assert.equal(await getDeviceToken(), 'tok-1', 'served from cache')
  assert.equal(cachedDeviceToken(), 'tok-1')
  clearDeviceToken()
  assert.equal(await getDeviceToken(), 'tok-2', 'minted again after clear')
}

console.log('✅ soe quota assertions passed')
})
