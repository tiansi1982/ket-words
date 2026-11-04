// E4：前端错误上报。无鉴权（错误可能发生在登录之前），但按 IP 每天限次、
// 字段截断、只保留 30 天。查看：
//   npx wrangler d1 execute ket-words-sync --remote --command \
//     "SELECT datetime(at/1000,'unixepoch') t, message, url, build FROM client_errors ORDER BY at DESC LIMIT 20"
import { type SyncEnv, json, err } from './sync/_lib'
import { type QuotaEnv, bumpQuota, clientIp, quotaDay } from './_quota'

export const REPORTS_PER_IP_DAILY = 50
const LIMITS = { message: 500, stack: 4000, url: 500, ua: 300, build: 80 }

const clip = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null)

export async function onRequestPost(ctx: {
  request: Request
  env: Partial<SyncEnv> & QuotaEnv
  waitUntil?: (p: Promise<unknown>) => void
}): Promise<Response> {
  const db = ctx.env.DB
  if (!db) return err(500, 500, 'database not configured')

  const body = (await ctx.request.json().catch(() => null)) as Record<string, unknown> | null
  const message = clip(body?.message, LIMITS.message)
  if (!message) return err(400, 400, 'missing message')

  const ip = clientIp(ctx.request)
  const n = await bumpQuota(db, `err-ip:${ip}`, quotaDay(new Date(), ctx.env.SOE_QUOTA_TZ))
  if (n > REPORTS_PER_IP_DAILY) return err(429, 429, 'too many reports today')

  await db
    .prepare('INSERT INTO client_errors (at, message, stack, url, ua, build, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(
      Date.now(),
      message,
      clip(body?.stack, LIMITS.stack),
      clip(body?.url, LIMITS.url),
      clip(ctx.request.headers.get('User-Agent'), LIMITS.ua),
      clip(body?.build, LIMITS.build),
      ip
    )
    .run()

  if (Math.random() < 0.02) {
    const purge = db.prepare('DELETE FROM client_errors WHERE at < ?').bind(Date.now() - 30 * 86_400_000).run().catch(() => undefined)
    if (ctx.waitUntil) ctx.waitUntil(purge)
  }
  return json({ ok: true })
}
