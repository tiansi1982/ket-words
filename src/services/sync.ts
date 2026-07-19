// P3 cloud sync via our own Pages Functions API (functions/api/sync/*, D1).
// Replaced LeanCloud after its international service was retired in 2026.
//
// Each kid profile binds its own username/password account, with one session
// token per profile kept in the store.
//
// Cloud model: one profile row per account holding a full ProfileData
// snapshot. Sync = pull → merge → apply → push. The merge never discards
// learning data (see mergeProfileData).
import type { ProfileData, WordProgress, DailySession, SyncAccount } from '@/types'
import { useUserStore, toDateStr } from '@/store/userStore'

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
}

async function fetchCloud(account: SyncAccount): Promise<CloudDoc | null> {
  const res = await apiFetch<{ profile: CloudDoc | null }>('/profile', {
    sessionToken: account.sessionToken,
  })
  return res.profile
}

async function pushCloud(
  account: SyncAccount,
  data: ProfileData,
  profileName: string
): Promise<void> {
  await apiFetch('/profile', {
    method: 'PUT',
    body: { data, profileName, clientUpdatedAt: Date.now() },
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

// Never lose learning data: per-word newest record wins, daily counts take the
// max per day, error banks union (a word cleared on one device may briefly
// reappear — it clears again after practice, which beats losing errors)
export function mergeProfileData(local: ProfileData, remote: ProfileData): ProfileData {
  const progress: Record<number, WordProgress> = { ...remote.progress }
  for (const p of Object.values(local.progress ?? {})) {
    const r = progress[p.wordId]
    if (!r || (p.lastStudied ?? 0) >= (r.lastStudied ?? 0)) progress[p.wordId] = p
  }

  const dailyLog: Record<string, number> = { ...(remote.dailyLog ?? {}) }
  for (const [day, n] of Object.entries(local.dailyLog ?? {})) {
    dailyLog[day] = Math.max(dailyLog[day] ?? 0, n)
  }

  const errorBank = [...new Set([...(local.errorBank ?? []), ...(remote.errorBank ?? [])])]

  return {
    dailyGoal: local.dailyGoal ?? remote.dailyGoal ?? 20,
    currentSession: pickSession(local.currentSession ?? null, remote.currentSession ?? null),
    progress,
    errorBank,
    dailyLog,
  }
}

// ── Sync engine ──

const inFlight = new Set<string>()
// Last data snapshot (JSON) known to match the cloud, per profile — lets the
// store subscription skip pushes when nothing learning-related changed
const lastSynced = new Map<string, string>()

// Pull → merge → apply → push for one profile. Throws on failure (callers
// doing background sync should use safeSync instead).
export async function syncProfile(profileId: string): Promise<void> {
  if (!syncConfigured || inFlight.has(profileId)) return
  const store = useUserStore.getState()
  const account = store.syncAccounts[profileId]
  if (!account || account.invalid) return

  inFlight.add(profileId)
  try {
    const cloud = await fetchCloud(account)
    const local = useUserStore.getState().getProfileData(profileId)
    if (!local) return

    const merged = cloud?.data ? mergeProfileData(local, cloud.data) : local
    const mergedJson = JSON.stringify(merged)
    // Record before applying so the store subscription doesn't re-schedule
    lastSynced.set(profileId, mergedJson)

    if (mergedJson !== JSON.stringify(local)) {
      useUserStore.getState().applyProfileData(profileId, merged)
    }

    if (!cloud || JSON.stringify(cloud.data) !== mergedJson) {
      const name =
        useUserStore.getState().profileList.find((p) => p.id === profileId)?.name ?? ''
      await pushCloud(account, merged, name)
    }
    useUserStore.getState().patchSyncAccount(profileId, { lastSyncAt: Date.now() })
  } catch (e) {
    if (e instanceof SyncError && e.code === SESSION_INVALID) {
      useUserStore.getState().patchSyncAccount(profileId, { invalid: true })
    }
    throw e
  } finally {
    inFlight.delete(profileId)
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

// Called once from App: initial pull for every bound profile, then keep the
// active profile pushed (debounced) as the kid studies
export function startAutoSync(): void {
  if (started || !syncConfigured) return
  started = true

  for (const id of Object.keys(useUserStore.getState().syncAccounts)) void safeSync(id)

  const unsyncedChange = (s: ReturnType<typeof useUserStore.getState>, profileId: string) => {
    const account = s.syncAccounts[profileId]
    if (!account || account.invalid) return false
    return JSON.stringify(s.getProfileData(profileId)) !== lastSynced.get(profileId)
  }

  let lastActive = useUserStore.getState().activeProfileId
  useUserStore.subscribe((s) => {
    if (s.activeProfileId !== lastActive) {
      const prev = lastActive
      lastActive = s.activeProfileId
      // flush what the profile we're leaving hasn't pushed yet
      clearTimeout(pushTimer)
      if (unsyncedChange(s, prev)) void safeSync(prev)
      void safeSync(lastActive)
      return
    }
    const profileId = s.activeProfileId
    if (!unsyncedChange(s, profileId)) return
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void safeSync(profileId), 3000)
  })

  window.addEventListener('online', () => void safeSync(useUserStore.getState().activeProfileId))
}
