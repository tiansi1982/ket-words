// Anonymous device token for /api/soe-url (R1). Profiles bound to a cloud
// account use their sync session instead; everyone else gets one of these,
// minted on first use and kept in localStorage so quota counts per device.

const KEY = 'ket-words-device'
let inflight: Promise<string | null> | null = null

export function cachedDeviceToken(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearDeviceToken(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
}

export function getDeviceToken(): Promise<string | null> {
  const cached = cachedDeviceToken()
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch('/api/device', { method: 'POST' })
        if (!res.ok) return null
        const { token } = (await res.json()) as { token?: string }
        if (!token) return null
        try {
          localStorage.setItem(KEY, token)
        } catch {
          /* fine — we'll mint another next time */
        }
        return token
      } catch {
        return null
      } finally {
        inflight = null
      }
    })()
  }
  return inflight
}
