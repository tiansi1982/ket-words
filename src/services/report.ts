// E4: ship uncaught errors to /api/report so bugs on the kids' devices are
// visible without a parent describing them. Deduped, capped per page load,
// off in dev. Nothing personal is sent: message, stack, page path, build.

declare const __BUILD__: string

const MAX_PER_LOAD = 5
const sent = new Set<string>()
let count = 0
let installed = false

export function reportError(error: unknown, extra?: string): void {
  if (import.meta.env.DEV) return
  if (count >= MAX_PER_LOAD) return
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const stack = [error instanceof Error ? error.stack : undefined, extra].filter(Boolean).join('\n').slice(0, 4000)
  const key = `${message}|${stack.split('\n')[1] ?? ''}`
  if (sent.has(key)) return
  sent.add(key)
  count++
  const body = JSON.stringify({ message, stack, url: location.pathname, build: typeof __BUILD__ === 'string' ? __BUILD__ : '' })
  try {
    if (navigator.sendBeacon?.('/api/report', new Blob([body], { type: 'application/json' }))) return
    void fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => undefined)
  } catch {
    /* reporting must never throw */
  }
}

export function installErrorReporting(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => reportError(e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
}

// test hook
export function _resetReporting(): void {
  sent.clear()
  count = 0
}
