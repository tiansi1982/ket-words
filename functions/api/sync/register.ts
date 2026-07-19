import {
  type SyncEnv,
  json,
  err,
  randomHex,
  hashPassword,
  readCredentials,
  createSession,
} from './_lib'

export async function onRequestPost(ctx: { request: Request; env: SyncEnv }): Promise<Response> {
  const cred = await readCredentials(ctx.request)
  if (cred instanceof Response) return cred

  const db = ctx.env.DB
  const salt = randomHex(16)
  const passHash = await hashPassword(cred.password, salt)
  const userId = crypto.randomUUID()
  try {
    await db
      .prepare('INSERT INTO users (id, username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, cred.username, passHash, salt, Date.now())
      .run()
  } catch {
    // UNIQUE 冲突：用户名已存在
    return err(409, 202, 'username already taken')
  }
  return json(await createSession(db, userId))
}
