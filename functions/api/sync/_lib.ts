// P3 云同步 API 的共享工具（下划线开头的文件不参与 Pages Functions 路由）。
//
// 错误码沿用原 LeanCloud 约定，前端 syncErrorText 不用改：
//   202 用户名已被占用 / 210 用户名或密码不对 / 211 会话失效需重新登录 / 219 尝试太多
//
// E6：会话 90 天过期（按 created_at 判断，无需建表变更）；登录/注册按 IP 与用户名
// 每小时限次（计数复用 soe_quota 表，bucket 为 UTC 小时）；注册密码至少 8 位。

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  run(): Promise<unknown>
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement
}
export interface SyncEnv {
  DB: D1Database
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function err(status: number, code: number, error: string): Response {
  return json({ code, error }, status)
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomHex(byteLen: number): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLen)))
}

// PBKDF2-SHA256。迭代次数受 Workers 免费版单请求 CPU 时间（~10ms）约束，
// 取 1 万次；学习进度数据价值低，这个强度够用。
const PBKDF2_ITERATIONS = 10_000

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)))
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  )
  return bytesToHex(new Uint8Array(bits))
}

interface SessionRow {
  user_id: string
}

// 会话有效期；过期的 token 视为失效（前端收到 211 后提示重新登录）
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000

export function sessionCutoff(now = Date.now()): number {
  return now - SESSION_TTL_MS
}

// 校验 Authorization: Bearer <token>；失败返回 211 Response，成功返回 userId
export async function requireSession(
  request: Request,
  db: D1Database
): Promise<{ userId: string } | Response> {
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return err(401, 211, 'missing session token')
  const row = await db
    .prepare('SELECT user_id FROM sessions WHERE token = ? AND created_at > ?')
    .bind(token, sessionCutoff())
    .first<SessionRow>()
  if (!row) return err(401, 211, 'invalid or expired session token')
  return { userId: row.user_id }
}

// 登录/注册限次：同一主体每小时最多 limit 次，超过返回 219
export const LOGIN_PER_IP_HOURLY = 20
export const LOGIN_PER_USER_HOURLY = 10
export const REGISTER_PER_IP_HOURLY = 10

export function hourBucket(now = new Date()): string {
  return now.toISOString().slice(0, 13) // YYYY-MM-DDTHH (UTC)
}

export async function overLimit(db: D1Database, key: string, limit: number): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO soe_quota (key, day, count) VALUES (?, ?, 1)
       ON CONFLICT(key, day) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(key, hourBucket())
    .first<{ count: number }>()
  return (row?.count ?? 1) > limit
}

export const tooMany = () => err(429, 219, 'too many attempts, try again later')

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}

// 发音评测的调用主体：云同步账号（u:<user_id>）或匿名设备（d:<token>）。
// 都对不上时返回 null。
export async function resolvePrincipal(
  request: Request,
  db: D1Database
): Promise<{ key: string } | null> {
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const session = await db
    .prepare('SELECT user_id FROM sessions WHERE token = ? AND created_at > ?')
    .bind(token, sessionCutoff())
    .first<SessionRow>()
  if (session) return { key: `u:${session.user_id}` }
  const device = await db
    .prepare('SELECT token FROM devices WHERE token = ?')
    .bind(token)
    .first<{ token: string }>()
  if (device) return { key: `d:${token}` }
  return null
}

export interface Credentials {
  username: string
  password: string
}

// 解析并校验注册/登录请求体；不合法时返回 Response。
// 注册要求密码 ≥ 8 位；登录保持 ≥ 6（老账号）
export const REGISTER_MIN_PASSWORD = 8
export const LOGIN_MIN_PASSWORD = 6

export async function readCredentials(
  request: Request,
  minPassword = LOGIN_MIN_PASSWORD
): Promise<Credentials | Response> {
  const body = (await request.json().catch(() => null)) as {
    username?: unknown
    password?: unknown
  } | null
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!/^\S{3,32}$/.test(username) || password.length < minPassword || password.length > 72) {
    return err(400, 400, 'invalid username or password format')
  }
  return { username, password }
}

// 新建会话并返回给前端的凭证（objectId 字段名沿用旧接口，SyncPanel 不用改）
export async function createSession(
  db: D1Database,
  userId: string
): Promise<{ objectId: string; sessionToken: string }> {
  const token = randomHex(32)
  await db
    .prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .bind(token, userId, Date.now())
    .run()
  // Expired sessions are useless rows; sweep them now and then
  if (Math.random() < 0.05) {
    await db.prepare('DELETE FROM sessions WHERE created_at <= ?').bind(sessionCutoff()).run().catch(() => undefined)
  }
  return { objectId: userId, sessionToken: token }
}
