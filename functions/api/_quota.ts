// 每日配额计数（R1）。下划线开头的文件不参与 Pages Functions 路由。
import type { D1Database } from './sync/_lib'

export interface QuotaEnv {
  DB?: D1Database
  SOE_DAILY_LIMIT?: string // 每个账号/设备每天可签发的评测次数，默认 300
  SOE_IP_DAILY_LIMIT?: string // 每个来源 IP 每天上限，默认 1500（一家几个孩子共用一个出口也够）
  SOE_DEVICE_IP_DAILY_LIMIT?: string // 每个 IP 每天可新建的设备令牌数，默认 20
  SOE_QUOTA_TZ?: string // 配额按哪个时区的自然日重置，默认 Asia/Shanghai
}

export function intEnv(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

// 孩子眼里的"今天"：按北京时间自然日重置，而不是 UTC
export function quotaDay(now = new Date(), timeZone = 'Asia/Shanghai'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}

// 原子 +1 并返回当天累计次数
export async function bumpQuota(db: D1Database, key: string, day: string): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO soe_quota (key, day, count) VALUES (?, ?, 1)
       ON CONFLICT(key, day) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(key, day)
    .first<{ count: number }>()
  return row?.count ?? 1
}

// 历史计数只用于当天限额，隔几天清一次即可
export async function purgeQuotaBefore(db: D1Database, day: string): Promise<void> {
  await db.prepare('DELETE FROM soe_quota WHERE day < ?').bind(day).run()
}

export function daysAgo(n: number, now = new Date(), timeZone?: string): string {
  return quotaDay(new Date(now.getTime() - n * 86_400_000), timeZone)
}
