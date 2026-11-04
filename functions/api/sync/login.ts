import {
  type SyncEnv,
  json,
  err,
  hashPassword,
  readCredentials,
  createSession,
  overLimit,
  tooMany,
  clientIp,
  LOGIN_PER_IP_HOURLY,
  LOGIN_PER_USER_HOURLY,
} from './_lib'

interface UserRow {
  id: string
  pass_hash: string
  salt: string
}

export async function onRequestPost(ctx: { request: Request; env: SyncEnv }): Promise<Response> {
  const cred = await readCredentials(ctx.request)
  if (cred instanceof Response) return cred

  const db = ctx.env.DB
  // Throttle by source and by target account before touching the password
  if (await overLimit(db, `login-ip:${clientIp(ctx.request)}`, LOGIN_PER_IP_HOURLY)) return tooMany()
  if (await overLimit(db, `login-user:${cred.username.toLowerCase()}`, LOGIN_PER_USER_HOURLY)) return tooMany()

  const user = await db
    .prepare('SELECT id, pass_hash, salt FROM users WHERE username = ?')
    .bind(cred.username)
    .first<UserRow>()
  // 用户不存在时也照常算一次哈希，避免用响应时间探测用户名
  const hash = await hashPassword(cred.password, user?.salt ?? '00'.repeat(16))
  if (!user || hash !== user.pass_hash) return err(401, 210, 'invalid username or password')
  return json(await createSession(db, user.id))
}
