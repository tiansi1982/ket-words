import { type SyncEnv, json, err, requireSession } from './_lib'

interface ProfileRow {
  data: string
  profile_name: string | null
  client_updated_at: number | null
  version: number | null
}

// GET：读取当前账号的云端档案快照及其版本号；还没有时 profile 为 null
export async function onRequestGet(ctx: { request: Request; env: SyncEnv }): Promise<Response> {
  const session = await requireSession(ctx.request, ctx.env.DB)
  if (session instanceof Response) return session

  const row = await ctx.env.DB
    .prepare('SELECT data, profile_name, client_updated_at, version FROM profiles WHERE user_id = ?')
    .bind(session.userId)
    .first<ProfileRow>()
  if (!row) return json({ profile: null })
  return json({
    profile: {
      data: JSON.parse(row.data),
      profileName: row.profile_name ?? '',
      clientUpdatedAt: row.client_updated_at ?? 0,
      version: row.version ?? 0,
    },
  })
}

// PUT：整包写入当前账号的云端档案快照（合并在客户端完成）。
// R01：带 baseVersion 时只在云端仍是该版本时写入（0 = 读取时还没有快照，
// 或是迁移前的老记录），否则 409，客户端重新拉取合并后再写。
// 不带 baseVersion 的老客户端照旧直接覆盖。成功返回新版本号。
export async function onRequestPut(ctx: { request: Request; env: SyncEnv }): Promise<Response> {
  const session = await requireSession(ctx.request, ctx.env.DB)
  if (session instanceof Response) return session

  const body = (await ctx.request.json().catch(() => null)) as {
    data?: unknown
    profileName?: unknown
    clientUpdatedAt?: unknown
    baseVersion?: unknown
  } | null
  if (!body || typeof body.data !== 'object' || body.data === null) {
    return err(400, 400, 'missing profile data')
  }
  const base = body.baseVersion
  if (base !== undefined && !(Number.isInteger(base) && (base as number) >= 0)) {
    return err(400, 400, 'invalid baseVersion')
  }
  const dataJson = JSON.stringify(body.data)
  if (dataJson.length > 1_000_000) return err(413, 413, 'profile snapshot too large')

  const db = ctx.env.DB
  const name = typeof body.profileName === 'string' ? body.profileName : ''
  const clientUpdatedAt = typeof body.clientUpdatedAt === 'number' ? body.clientUpdatedAt : Date.now()
  const now = Date.now()

  let row: { version: number } | null
  if (base === undefined) {
    row = await db
      .prepare(
        `INSERT INTO profiles (user_id, data, profile_name, client_updated_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(user_id) DO UPDATE SET
           data = excluded.data,
           profile_name = excluded.profile_name,
           client_updated_at = excluded.client_updated_at,
           updated_at = excluded.updated_at,
           version = version + 1
         RETURNING version`
      )
      .bind(session.userId, dataJson, name, clientUpdatedAt, now)
      .first<{ version: number }>()
  } else {
    row = await db
      .prepare(
        `UPDATE profiles SET data = ?, profile_name = ?, client_updated_at = ?, updated_at = ?, version = version + 1
         WHERE user_id = ? AND version = ?
         RETURNING version`
      )
      .bind(dataJson, name, clientUpdatedAt, now, session.userId, base)
      .first<{ version: number }>()
    if (!row && base === 0) {
      // 账号的第一份快照；期间已被别的设备抢先创建时不写入，落到下面的 409
      row = await db
        .prepare(
          `INSERT INTO profiles (user_id, data, profile_name, client_updated_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT(user_id) DO NOTHING
           RETURNING version`
        )
        .bind(session.userId, dataJson, name, clientUpdatedAt, now)
        .first<{ version: number }>()
    }
    if (!row) return err(409, 409, 'profile changed since it was read')
  }
  return json({ ok: true, version: row?.version ?? 0 })
}
