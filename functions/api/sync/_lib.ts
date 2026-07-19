// P3 云同步 API 的共享工具（下划线开头的文件不参与 Pages Functions 路由）。
//
// 错误码沿用原 LeanCloud 约定，前端 syncErrorText 不用改：
//   202 用户名已被占用 / 210 用户名或密码不对 / 211 会话失效需重新登录

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

// 校验 Authorization: Bearer <token>；失败返回 211 Response，成功返回 userId
export async function requireSession(
  request: Request,
  db: D1Database
): Promise<{ userId: string } | Response> {
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return err(401, 211, 'missing session token')
  const row = await db
    .prepare('SELECT user_id FROM sessions WHERE token = ?')
    .bind(token)
    .first<SessionRow>()
  if (!row) return err(401, 211, 'invalid session token')
  return { userId: row.user_id }
}

export interface Credentials {
  username: string
  password: string
}

// 解析并校验注册/登录请求体；不合法时返回 Response
export async function readCredentials(request: Request): Promise<Credentials | Response> {
  const body = (await request.json().catch(() => null)) as {
    username?: unknown
    password?: unknown
  } | null
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  // 与 SyncPanel 的前端校验一致：用户名 ≥3，密码 ≥6
  if (!/^\S{3,32}$/.test(username) || password.length < 6 || password.length > 72) {
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
  return { objectId: userId, sessionToken: token }
}
