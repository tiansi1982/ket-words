// 匿名设备令牌（R1）：没有绑定云同步账号的孩子也要能用发音评测，
// 但每次调用必须能归到一个主体上计配额。令牌只存本机 localStorage。
import { type SyncEnv, json, err, randomHex } from './sync/_lib'
import { type QuotaEnv, bumpQuota, clientIp, intEnv, quotaDay } from './_quota'

export async function onRequestPost(ctx: {
  request: Request
  env: Partial<SyncEnv> & QuotaEnv
}): Promise<Response> {
  const db = ctx.env.DB
  if (!db) return err(500, 500, 'database not configured')

  const ip = clientIp(ctx.request)
  const issued = await bumpQuota(db, `dev-ip:${ip}`, quotaDay(new Date(), ctx.env.SOE_QUOTA_TZ))
  if (issued > intEnv(ctx.env.SOE_DEVICE_IP_DAILY_LIMIT, 20)) {
    return err(429, 429, 'too many devices registered from this address today')
  }

  const token = randomHex(32)
  await db
    .prepare('INSERT INTO devices (token, created_at, ip) VALUES (?, ?, ?)')
    .bind(token, Date.now(), ip)
    .run()
  return json({ token })
}
