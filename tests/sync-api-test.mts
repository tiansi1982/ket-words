// E6/E4: register/login hardening and the error-report endpoint, against an
// in-memory D1 stand-in; plus the client reporter's dedupe and cap
import assert from 'node:assert'
import { test } from 'vitest'

class FakeD1 {
  users = new Map<string, { id: string; pass_hash: string; salt: string }>()
  sessions = new Map<string, { user_id: string; created_at: number }>()
  quota = new Map<string, number>()
  errors: unknown[][] = []
  prepare(sql: string) {
    const self = this
    return {
      bind(...v: unknown[]) {
        return {
          async first<T>(): Promise<T | null> {
            if (sql.includes('FROM sessions')) {
              const s = self.sessions.get(v[0] as string)
              if (!s) return null
              if (sql.includes('created_at >') && !(s.created_at > (v[1] as number))) return null
              return { user_id: s.user_id } as T
            }
            if (sql.startsWith('SELECT id FROM users')) {
              const u = self.users.get(v[0] as string)
              return (u ? { id: u.id } : null) as T
            }
            if (sql.includes('FROM users')) return (self.users.get(v[0] as string) ?? null) as T
            if (sql.includes('INSERT INTO soe_quota')) {
              const k = `${v[0]}|${v[1]}`
              const n = (self.quota.get(k) ?? 0) + 1
              self.quota.set(k, n)
              return { count: n } as T
            }
            throw new Error('unexpected first(): ' + sql)
          },
          async run() {
            if (sql.includes('INSERT INTO users')) {
              if (self.users.has(v[1] as string)) throw new Error('UNIQUE constraint failed: users.username')
              self.users.set(v[1] as string, { id: v[0] as string, pass_hash: v[2] as string, salt: v[3] as string })
              return
            }
            if (sql.includes('INSERT INTO sessions')) return void self.sessions.set(v[0] as string, { user_id: v[1] as string, created_at: v[2] as number })
            if (sql.includes('DELETE FROM sessions')) {
              for (const [t, s] of [...self.sessions]) if (s.created_at <= (v[0] as number)) self.sessions.delete(t)
              return
            }
            if (sql.includes('INSERT INTO client_errors')) return void self.errors.push(v)
            if (sql.includes('DELETE FROM client_errors')) return
            throw new Error('unexpected run(): ' + sql)
          },
        }
      },
    }
  }
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}, ip = '1.2.3.4') =>
  new Request(`https://ket-words.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, 'User-Agent': 'TestUA/1.0', ...headers },
    body: JSON.stringify(body),
  })

test('sync-api-test', async () => {
  const { onRequestPost: register } = await import('../functions/api/sync/register')
  const { onRequestPost: login } = await import('../functions/api/sync/login')
  const { onRequestPost: report, REPORTS_PER_IP_DAILY } = await import('../functions/api/report')
  const { requireSession, SESSION_TTL_MS, LOGIN_PER_USER_HOURLY, REGISTER_PER_IP_HOURLY } = await import('../functions/api/sync/_lib')
  const db = new FakeD1()
  const env = { DB: db } as never
  const code = async (res: Response) => ((await res.json()) as { code?: number }).code

  // ── register: password ≥ 8, duplicate → 202, DB error ≠ 202 ──
  assert.equal(await code(await register({ request: post('/r', { username: 'kid1', password: 'short7!' }), env })), 400, 'seven chars rejected for signup')
  const ok = await register({ request: post('/r', { username: 'kid1', password: 'longenough' }), env })
  assert.equal(ok.status, 200)
  const { sessionToken } = (await ok.json()) as { sessionToken: string }
  assert.equal(await code(await register({ request: post('/r', { username: 'kid1', password: 'longenough' }), env })), 202, 'taken name')
  db.prepare = ((orig) => function (this: FakeD1, sql: string) {
    if (sql.includes('INSERT INTO users')) return { bind: () => ({ run: async () => { throw new Error('D1_ERROR: disk') }, first: async () => null }) }
    return orig.call(this, sql)
  })(db.prepare) as never
  assert.equal(await code(await register({ request: post('/r', { username: 'kid2', password: 'longenough' }), env })), 500, 'a real DB error is not "taken"')
  db.prepare = FakeD1.prototype.prepare

  // ── login: ok, wrong password, legacy 6-char passwords still accepted at the format check ──
  assert.equal((await login({ request: post('/l', { username: 'kid1', password: 'longenough' }), env })).status, 200)
  assert.equal(await code(await login({ request: post('/l', { username: 'kid1', password: 'wrongpass' }), env })), 210)
  assert.equal(await code(await login({ request: post('/l', { username: 'kid1', password: 'sixsix' }), env })), 210, '6 chars passes the format check, fails the password')

  // ── login throttle per username ──
  for (let i = 0; i < LOGIN_PER_USER_HOURLY; i++) await login({ request: post('/l', { username: 'kid1', password: 'wrongpass' }, {}, `9.9.9.${i}`), env })
  assert.equal(await code(await login({ request: post('/l', { username: 'kid1', password: 'longenough' }, {}, '9.9.9.99'), env })), 219, 'account locked out for the hour even with the right password')

  // ── register throttle per IP ──
  for (let i = 0; i < REGISTER_PER_IP_HOURLY; i++) await register({ request: post('/r', { username: `u${i}x`, password: 'longenough' }, {}, '5.5.5.5'), env })
  assert.equal(await code(await register({ request: post('/r', { username: 'onemore', password: 'longenough' }, {}, '5.5.5.5'), env })), 219)

  // ── session expiry ──
  const bearer = (t: string) => new Request('https://x/p', { headers: { Authorization: `Bearer ${t}` } })
  const live = await requireSession(bearer(sessionToken), db)
  assert.ok(!(live instanceof Response), 'fresh session accepted')
  db.sessions.get(sessionToken)!.created_at = Date.now() - SESSION_TTL_MS - 1000
  const stale = await requireSession(bearer(sessionToken), db)
  assert.ok(stale instanceof Response && (await code(stale)) === 211, 'expired session → 211')

  // ── error report endpoint ──
  const r1 = await report({ request: post('/api/report', { message: 'TypeError: x is undefined', stack: 'a\nb', url: '/study', build: '2026-11-04-abc' }), env })
  assert.equal(r1.status, 200)
  assert.equal(db.errors.length, 1)
  assert.equal(db.errors[0][1], 'TypeError: x is undefined')
  assert.equal(db.errors[0][4], 'TestUA/1.0')
  assert.equal(db.errors[0][5], '2026-11-04-abc')
  assert.equal((await report({ request: post('/api/report', { stack: 'no message' }), env })).status, 400)
  const long = await report({ request: post('/api/report', { message: 'm'.repeat(9000), stack: 's'.repeat(9000) }), env })
  assert.equal(long.status, 200)
  assert.equal((db.errors.at(-1)![1] as string).length, 500, 'message clipped')
  assert.equal((db.errors.at(-1)![2] as string).length, 4000, 'stack clipped')
  for (let i = 0; i < REPORTS_PER_IP_DAILY; i++) assert.equal((await report({ request: post('/api/report', { message: 'spam' }, {}, '7.7.7.7'), env })).status, 200)
  assert.equal((await report({ request: post('/api/report', { message: 'spam' }, {}, '7.7.7.7'), env })).status, 429, 'daily cap per IP')
  assert.equal((await report({ request: post('/api/report', { message: 'x' }), env: {} as never })).status, 500, 'no D1 → 500')

  // ── client reporter: dedupe + cap, nothing in dev ──
  const calls: string[] = []
  Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: (_u: string, b: Blob) => { calls.push(String(b.size)); return true } }, configurable: true })
  Object.defineProperty(globalThis, 'location', { value: { pathname: '/study' }, configurable: true })
  const { reportError, _resetReporting } = await import('../src/services/report')
  _resetReporting()
  const e = new Error('boom')
  reportError(e)
  reportError(e)
  reportError(new Error('boom'))
  assert.ok(calls.length <= 2, 'same error reported at most once per distinct stack')
  const before = calls.length
  for (let i = 0; i < 10; i++) reportError(new Error(`distinct ${i}`))
  assert.ok(calls.length - before <= 5, 'capped per page load')

  console.log('✅ sync api / report assertions passed')
})
