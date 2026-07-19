import { type SyncEnv, json, err, requireSession } from './_lib'

interface ProfileRow {
  data: string
  profile_name: string | null
  client_updated_at: number | null
}

// GET：读取当前账号的云端档案快照；还没有时 profile 为 null
export async function onRequestGet(ctx: { request: Request; env: SyncEnv }): Promise<Response> {
  const session = await requireSession(ctx.request, ctx.env.DB)
  if (session instanceof Response) return session

  const row = await ctx.env.DB
    .prepare('SELECT data, profile_name, client_updated_at FROM profiles WHERE user_id = ?')
    .bind(session.userId)
    .first<ProfileRow>()
  if (!row) return json({ profile: null })
  return json({
    profile: {
      data: JSON.parse(row.data),
      profileName: row.profile_name ?? '',
      clientUpdatedAt: row.client_updated_at ?? 0,
    },
  })
}

// PUT：整包覆盖当前账号的云端档案快照（合并在客户端完成）
export async function onRequestPut(ctx: { request: Request; env: SyncEnv }): Promise<Response> {
  const session = await requireSession(ctx.request, ctx.env.DB)
  if (session instanceof Response) return session

  const body = (await ctx.request.json().catch(() => null)) as {
    data?: unknown
    profileName?: unknown
    clientUpdatedAt?: unknown
  } | null
  if (!body || typeof body.data !== 'object' || body.data === null) {
    return err(400, 400, 'missing profile data')
  }
  const dataJson = JSON.stringify(body.data)
  if (dataJson.length > 1_000_000) return err(413, 413, 'profile snapshot too large')

  await ctx.env.DB
    .prepare(
      `INSERT INTO profiles (user_id, data, profile_name, client_updated_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         data = excluded.data,
         profile_name = excluded.profile_name,
         client_updated_at = excluded.client_updated_at,
         updated_at = excluded.updated_at`
    )
    .bind(
      session.userId,
      dataJson,
      typeof body.profileName === 'string' ? body.profileName : '',
      typeof body.clientUpdatedAt === 'number' ? body.clientUpdatedAt : Date.now(),
      Date.now()
    )
    .run()
  return json({ ok: true })
}
