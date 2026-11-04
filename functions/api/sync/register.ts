import {
  type SyncEnv,
  json,
  err,
  randomHex,
  hashPassword,
  readCredentials,
  createSession,
  overLimit,
  tooMany,
  clientIp,
  REGISTER_MIN_PASSWORD,
  REGISTER_PER_IP_HOURLY,
} from './_lib'

export async function onRequestPost(ctx: { request: Request; env: SyncEnv }): Promise<Response> {
  const cred = await readCredentials(ctx.request, REGISTER_MIN_PASSWORD)
  if (cred instanceof Response) return cred

  const db = ctx.env.DB
  if (await overLimit(db, `register-ip:${clientIp(ctx.request)}`, REGISTER_PER_IP_HOURLY)) return tooMany()

  // Taken names get the dedicated code; anything else that fails on insert
  // is a real database error, not a name clash
  const taken = await db.prepare('SELECT id FROM users WHERE username = ?').bind(cred.username).first<{ id: string }>()
  if (taken) return err(409, 202, 'username already taken')

  const salt = randomHex(16)
  const passHash = await hashPassword(cred.password, salt)
  const userId = crypto.randomUUID()
  try {
    await db
      .prepare('INSERT INTO users (id, username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, cred.username, passHash, salt, Date.now())
      .run()
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) return err(409, 202, 'username already taken')
    return err(500, 500, 'database error')
  }
  return json(await createSession(db, userId))
}
