// P3 cloud sync via our own Pages Functions API (functions/api/sync/*, D1).
// Replaced LeanCloud after its international service was retired in 2026.
//
// Each kid profile binds its own username/password account, with one session
// token per profile kept in the store.
//
// Cloud model: one profile row per account holding a full ProfileData
// snapshot plus a version number. Sync = pull → merge → apply → push, the
// push conditional on the version pulled (R01): if another device wrote in
// between, pull again and re-merge. The merge never discards learning data
// (see mergeProfileData).
import type { ProfileData, WordProgress, DailySession, SyncAccount, PlacementRecord } from '@/types'
import { useUserStore, toDateStr } from '@/store/userStore'
import { DEFAULT_DAILY_GOAL } from '@/lib/settings'
import { remapProfileData } from '@/lib/word-aliases'
import { mergeErrorBanks } from '@/lib/error-bank'

// Same-origin API — no config needed; the panel only fails at runtime when
// the app is served without Functions (plain `vite dev`)
export const syncConfigured = true

// ── Minimal REST client ──

export class SyncError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = 'SyncError'
    this.code = code
  }
}

// LeanCloud error codes we turn into friendly messages
export function syncErrorText(e: unknown): string {
  if (e instanceof SyncError) {
    switch (e.code) {
      case 202:
        return '用户名已被占用'
      case 210:
      case 211:
        return '用户名或密码不对'
      case 219:
        return '尝试次数太多，请稍后再试'
      default:
        return `同步失败（${e.code}）`
    }
  }
  return '网络不给力，请稍后再试'
}

const SESSION_INVALID = 211
// The cloud snapshot changed since we pulled it (another device synced)
const CONFLICT = 409

async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; sessionToken?: string } = {}
): Promise<T> {
  const res = await fetch(`/api/sync${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.sessionToken ? { Authorization: `Bearer ${opts.sessionToken}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const json: { code?: number; error?: string } = await res.json().catch(() => ({}))
  if (!res.ok) throw new SyncError(json.code ?? res.status, json.error ?? `HTTP ${res.status}`)
  return json as T
}

// ── Auth ──

interface AuthResult {
  objectId: string
  sessionToken: string
}

export function signUp(username: string, password: string): Promise<AuthResult> {
  return apiFetch<AuthResult>('/register', { method: 'POST', body: { username, password } })
}

export function logIn(username: string, password: string): Promise<AuthResult> {
  return apiFetch<AuthResult>('/login', { method: 'POST', body: { username, password } })
}

// ── Cloud document ──

interface CloudDoc {
  data?: ProfileData
  profileName?: string
  clientUpdatedAt?: number
  version?: number // absent from servers before R01
}

async function fetchCloud(account: SyncAccount): Promise<CloudDoc | null> {
  const res = await apiFetch<{ profile: CloudDoc | null }>('/profile', {
    sessionToken: account.sessionToken,
  })
  return res.profile
}

// Writes only if the cloud is still at baseVersion (0 = no snapshot yet);
// otherwise the server answers 409
async function pushCloud(
  account: SyncAccount,
  data: ProfileData,
  profileName: string,
  baseVersion: number
): Promise<void> {
  await apiFetch('/profile', {
    method: 'PUT',
    body: { data, profileName, clientUpdatedAt: Date.now(), baseVersion },
    sessionToken: account.sessionToken,
  })
}

// ── Merge (pure; exercised by tests/sync-test.mts) ──

// Today's session with the most progress wins; stale sessions fall back
// local-first (pages already ignore sessions from another day)
function pickSession(a: DailySession | null, b: DailySession | null): DailySession | null {
  const today = toDateStr(new Date())
  const at = a?.date === today ? a : null
  const bt = b?.date === today ? b : null
  if (at && bt) return (bt.currentIndex ?? 0) > (at.currentIndex ?? 0) ? bt : at
  return at ?? bt ?? a ?? b
}

function newerPlacement(a: PlacementRecord | null, b: PlacementRecord | null): PlacementRecord | null {
  if (!a || !b) return a ?? b
  return b.date > a.date ? b : a
}

// The goal chosen most recently wins (R18). Without a choice stamp on either
// side (data from older clients) a non-default goal beats the default, so a
// new device's 20 doesn't overwrite the 50 picked on the old one.
function pickDailyGoal(local: ProfileData, remote: ProfileData): { dailyGoal: number; dailyGoalSetAt: number } {
  const lt = local.dailyGoalSetAt ?? 0
  const rt = remote.dailyGoalSetAt ?? 0
  const localGoal = local.dailyGoal ?? DEFAULT_DAILY_GOAL
  const remoteGoal = remote.dailyGoal ?? DEFAULT_DAILY_GOAL
  if (lt || rt) return rt > lt ? { dailyGoal: remoteGoal, dailyGoalSetAt: rt } : { dailyGoal: localGoal, dailyGoalSetAt: lt }
  return { dailyGoal: localGoal !== DEFAULT_DAILY_GOAL ? localGoal : remoteGoal, dailyGoalSetAt: 0 }
}

// Never lose learning data: per-word newest record wins, daily counts take the
// max per day (so two devices studying at the very same time can undercount),
// and each error-bank word follows its most recent add/remove (R02)
export function mergeProfileData(local: ProfileData, remote: ProfileData): ProfileData {
  // Snapshots written by older clients may still use pre-dedupe word ids
  local = remapProfileData(local)
  remote = remapProfileData(remote)
  const progress: Record<number, WordProgress> = { ...remote.progress }
  for (const p of Object.values(local.progress ?? {})) {
    const r = progress[p.wordId]
    if (!r || (p.lastStudied ?? 0) >= (r.lastStudied ?? 0)) progress[p.wordId] = p
  }

  const dailyLog: Record<string, number> = { ...(remote.dailyLog ?? {}) }
  for (const [day, n] of Object.entries(local.dailyLog ?? {})) {
    dailyLog[day] = Math.max(dailyLog[day] ?? 0, n)
  }
  const dailyRight: Record<string, number> = { ...(remote.dailyRight ?? {}) }
  for (const [day, n] of Object.entries(local.dailyRight ?? {})) {
    dailyRight[day] = Math.max(dailyRight[day] ?? 0, n)
  }

  const { errorBank, errorBankAt } = mergeErrorBanks(local, remote)
  const { dailyGoal, dailyGoalSetAt } = pickDailyGoal(local, remote)

  // Key order matches the store's snapshot(), so a merged snapshot and the
  // store after applying it serialize identically
  return {
    dailyGoal,
    currentSession: pickSession(local.currentSession ?? null, remote.currentSession ?? null),
    progress,
    errorBank,
    dailyLog,
    // local choices win, remote fills what this device never set
    settings: { ...(remote.settings ?? {}), ...(local.settings ?? {}) },
    // A round in progress is device-local: never filled in from the cloud,
    // or a round ended here would come straight back (R02)
    errorSession: local.errorSession ?? null,
    placement: newerPlacement(local.placement ?? null, remote.placement ?? null),
    dailyRight,
    achievementsSeen: [...new Set([...(local.achievementsSeen ?? []), ...(remote.achievementsSeen ?? [])])],
    errorBankAt,
    dailyGoalSetAt,
  }
}

// ── Sync engine ──

const inFlight = new Set<string>()
// Profiles asked to sync again while a sync was running (a change landed
// mid-push): re-checked once that sync ends instead of being dropped (R05)
const pending = new Set<string>()
// Last data snapshot (JSON) the cloud is known to hold, per profile. Set only
// after the push succeeded, so a failed upload still counts as unsynced (R05)
const lastSynced = new Map<string, string>()

// Pulls before giving up when other devices keep writing in between (R01)
const MAX_SYNC_ATTEMPTS = 3

// Backoff for retrying a failed background sync (R05); the last delay repeats
const RETRY_DELAYS_MS = [10_000, 30_000, 120_000, 300_000, 600_000]
const retryAttempts = new Map<string, number>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearRetryTimer(profileId: string): void {
  clearTimeout(retryTimers.get(profileId))
  retryTimers.delete(profileId)
}

function scheduleRetry(profileId: string): void {
  // Only the auto-sync engine retries; a one-off call (tests) shouldn't leave timers
  if (!started) return
  const n = retryAttempts.get(profileId) ?? 0
  retryAttempts.set(profileId, n + 1)
  clearRetryTimer(profileId)
  const delay = RETRY_DELAYS_MS[Math.min(n, RETRY_DELAYS_MS.length - 1)]
  retryTimers.set(
    profileId,
    setTimeout(() => {
      retryTimers.delete(profileId)
      void safeSync(profileId)
    }, delay)
  )
}

// The profile has learning data the cloud hasn't confirmed receiving
export function hasUnsyncedChanges(profileId: string): boolean {
  const s = useUserStore.getState()
  const account = s.syncAccounts[profileId]
  if (!account || account.invalid) return false
  return JSON.stringify(s.getProfileData(profileId)) !== lastSynced.get(profileId)
}

// Pull → merge → apply → push for one profile. Throws on failure (callers
// doing background sync should use safeSync instead).
export async function syncProfile(profileId: string): Promise<void> {
  if (!syncConfigured) return
  if (inFlight.has(profileId)) {
    pending.add(profileId)
    return
  }
  const store = useUserStore.getState()
  const account = store.syncAccounts[profileId]
  if (!account || account.invalid) return

  inFlight.add(profileId)
  clearRetryTimer(profileId)
  let ok = false
  try {
    for (let attempt = 1; ; attempt++) {
      const cloud = await fetchCloud(account)
      const local = useUserStore.getState().getProfileData(profileId)
      if (!local) return

      const merged = cloud?.data ? mergeProfileData(local, cloud.data) : local
      const mergedJson = JSON.stringify(merged)
      if (mergedJson !== JSON.stringify(local)) {
        useUserStore.getState().applyProfileData(profileId, merged)
      }

      if (!cloud || JSON.stringify(cloud.data) !== mergedJson) {
        const name =
          useUserStore.getState().profileList.find((p) => p.id === profileId)?.name ?? ''
        try {
          await pushCloud(account, merged, name, cloud?.version ?? 0)
        } catch (e) {
          // Another device synced since our pull: its snapshot isn't in
          // `merged` yet, so pull it and merge again rather than overwrite it
          if (e instanceof SyncError && e.code === CONFLICT && attempt < MAX_SYNC_ATTEMPTS) continue
          throw e
        }
      }
      lastSynced.set(profileId, mergedJson)
      break
    }
    ok = true
    retryAttempts.delete(profileId)
    useUserStore.getState().patchSyncAccount(profileId, { lastSyncAt: Date.now(), lastErrorAt: undefined })
  } catch (e) {
    if (e instanceof SyncError && e.code === SESSION_INVALID) {
      // Retrying can't help until the child logs in again
      useUserStore.getState().patchSyncAccount(profileId, { invalid: true })
    } else {
      useUserStore.getState().patchSyncAccount(profileId, { lastErrorAt: Date.now() })
      scheduleRetry(profileId)
    }
    throw e
  } finally {
    inFlight.delete(profileId)
    // A failed sync already has a retry queued; a successful one re-runs
    // only if something changed while it was busy
    if (pending.delete(profileId) && ok && hasUnsyncedChanges(profileId)) void safeSync(profileId)
  }
}

async function safeSync(profileId: string): Promise<void> {
  try {
    await syncProfile(profileId)
  } catch (e) {
    console.warn('[sync] background sync failed:', e)
  }
}

let started = false
let pushTimer: ReturnType<typeof setTimeout> | undefined
const PUSH_DEBOUNCE_MS = 3000

// Called once from App: initial pull for every bound profile, then keep the
// active profile pushed (debounced) as the kid studies
export function startAutoSync(): void {
  if (started || !syncConfigured) return
  started = true

  for (const id of Object.keys(useUserStore.getState().syncAccounts)) void safeSync(id)

  const dataJson = (s: ReturnType<typeof useUserStore.getState>, profileId: string) =>
    JSON.stringify(s.getProfileData(profileId))

  let lastActive = useUserStore.getState().activeProfileId
  // The active profile's data as of the last store update, so updates that
  // don't touch learning data (sync status, other profiles) don't schedule
  // pushes — otherwise a failure's own status update would retry every 3 s
  let lastSeen = dataJson(useUserStore.getState(), lastActive)
  useUserStore.subscribe((s) => {
    if (s.activeProfileId !== lastActive) {
      const prev = lastActive
      lastActive = s.activeProfileId
      lastSeen = dataJson(s, lastActive)
      // flush what the profile we're leaving hasn't pushed yet
      clearTimeout(pushTimer)
      if (hasUnsyncedChanges(prev)) void safeSync(prev)
      void safeSync(lastActive)
      return
    }
    const profileId = s.activeProfileId
    const account = s.syncAccounts[profileId]
    if (!account || account.invalid) return
    const json = dataJson(s, profileId)
    if (json === lastSeen) return
    lastSeen = json
    if (json === lastSynced.get(profileId)) return
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      if (hasUnsyncedChanges(profileId)) void safeSync(profileId)
    }, PUSH_DEBOUNCE_MS)
  })

  window.addEventListener('online', () => void safeSync(useUserStore.getState().activeProfileId))
}
