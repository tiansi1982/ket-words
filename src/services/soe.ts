// Tencent 智聆口语评测 (SOE) client. Gets a server-signed WSS URL from our
// Pages Function, taps the mic stream as 16kHz mono PCM and streams it to
// Tencent while the child reads; finish() returns the sentence score.
// When the backend isn't configured (501) the feature reports unavailable
// and speak practice stays pure record-and-compare.
//
// Every signing request carries a credential (R1): the active profile's sync
// session when it has one, otherwise an anonymous device token. The server
// meters both per day and answers 429 when today's budget is used up.
import { useUserStore } from '@/store/userStore'
import { cachedDeviceToken, clearDeviceToken, getDeviceToken } from '@/services/device'

export interface SoeWordScore {
  word: string
  score: number // 0-100
}

export interface SoeResult {
  score: number // 0-100 overall (SuggestedScore)
  words: SoeWordScore[]
}

export interface SoeSession {
  // Send the end frame and wait for Tencent's final verdict
  finish(): Promise<SoeResult | null>
  cancel(): void
}

// Why a session could not start: 'quota' = today's scoring budget is used up,
// 'unavailable' = backend not set up, 'error' = network or anything else
export type SoeStartFailure = 'quota' | 'unavailable' | 'error'
export type SoeStart =
  | { session: SoeSession; failure?: undefined; limit?: undefined }
  | { session: null; failure: SoeStartFailure; limit?: number }

const TARGET_RATE = 16000
// Tencent's final result normally lands well under this after {"type":"end"}
const FINAL_TIMEOUT_MS = 10000

// Linear-interpolation downsample to 16k signed 16-bit PCM
export function toPcm16k(input: Float32Array, fromRate: number): Int16Array {
  const ratio = fromRate / TARGET_RATE
  const length = Math.floor(input.length / ratio)
  const out = new Int16Array(length)
  for (let i = 0; i < length; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const sample = input[i0] + (input[i1] - input[i0]) * (pos - i0)
    const clamped = Math.max(-1, Math.min(1, sample))
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return out
}

// Defensive parse: new-version WSS returns SentenceInfo in `result` with the
// classic SOE PascalCase fields
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSoeResult(result: any): SoeResult | null {
  if (!result || typeof result !== 'object') return null
  const score = result.SuggestedScore ?? result.PronAccuracy
  if (typeof score !== 'number') return null
  const words: SoeWordScore[] = (Array.isArray(result.Words) ? result.Words : [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((w: any) => typeof w?.Word === 'string' && typeof w?.PronAccuracy === 'number')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((w: any) => ({ word: w.Word, score: Math.max(0, Math.round(w.PronAccuracy)) }))
  return { score: Math.max(0, Math.min(100, Math.round(score))), words }
}

// 501 from the Pages Function (or no Functions at all) means "not set up" —
// remember that and stop asking for this page load
let unavailable = false

async function soeToken(): Promise<string | null> {
  const s = useUserStore.getState()
  const account = s.syncAccounts[s.activeProfileId]
  if (account && !account.invalid) return account.sessionToken
  return getDeviceToken()
}

function postSignRequest(refText: string, token: string | null): Promise<Response> {
  return fetch('/api/soe-url', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ refText }),
  })
}

type SignResult =
  | { url: string; failure?: undefined; limit?: undefined }
  | { url?: undefined; failure: SoeStartFailure; limit?: number }

async function fetchSignedUrl(refText: string): Promise<SignResult> {
  if (unavailable) return { failure: 'unavailable' }
  try {
    let token = await soeToken()
    let res = await postSignRequest(refText, token)
    if (res.status === 401) {
      // A sync session the server has since dropped, or a device token it no
      // longer knows: fall back to a fresh device token once
      if (token && token === cachedDeviceToken()) clearDeviceToken()
      token = await getDeviceToken()
      if (token) res = await postSignRequest(refText, token)
    }
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as { limit?: unknown }
      return { failure: 'quota', limit: typeof body.limit === 'number' ? body.limit : undefined }
    }
    if (!res.ok) {
      if (res.status === 501 || res.status === 404 || res.status === 405) {
        unavailable = true
        return { failure: 'unavailable' }
      }
      return { failure: 'error' }
    }
    const { url } = (await res.json()) as { url?: string }
    return url ? { url } : { failure: 'error' }
  } catch {
    return { failure: 'error' }
  }
}

class WsSoeSession implements SoeSession {
  private ws: WebSocket | null = null
  private ctx: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  // Audio captured before the socket opens is queued, not dropped
  private queue: ArrayBuffer[] = []
  private open = false
  private closed = false
  private finalResult: SoeResult | null = null
  private onFinal: ((r: SoeResult | null) => void) | null = null

  private stream: MediaStream
  private refText: string

  constructor(stream: MediaStream, refText: string) {
    this.stream = stream
    this.refText = refText
  }

  // Resolves null when streaming has begun, otherwise why it could not
  async start(): Promise<{ failure: SoeStartFailure; limit?: number } | null> {
    const signed = await fetchSignedUrl(this.refText)
    if (signed.failure) return { failure: signed.failure, limit: signed.limit }
    if (this.closed) return { failure: 'error' }
    const url = signed.url

    // Tap the mic first so no audio is lost while the socket connects
    const ctx = new AudioContext()
    this.ctx = ctx
    this.source = ctx.createMediaStreamSource(this.stream)
    this.processor = ctx.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = (e) => {
      if (this.closed) return
      const pcm = toPcm16k(e.inputBuffer.getChannelData(0), ctx.sampleRate)
      this.send(pcm.buffer as ArrayBuffer)
    }
    this.source.connect(this.processor)
    this.processor.connect(ctx.destination) // required for onaudioprocess; output stays silent

    const ws = new WebSocket(url)
    this.ws = ws
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      this.open = true
      for (const chunk of this.queue) ws.send(chunk)
      this.queue = []
    }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data))
        if (msg.code !== 0) {
          this.settle(null)
          return
        }
        const parsed = parseSoeResult(msg.result)
        if (parsed) this.finalResult = parsed
        if (msg.final === 1) this.settle(this.finalResult)
      } catch { /* ignore non-JSON frames */ }
    }
    ws.onerror = () => this.settle(null)
    ws.onclose = () => this.settle(this.finalResult)
    return null
  }

  private send(chunk: ArrayBuffer): void {
    if (this.open && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk)
    } else if (!this.closed) {
      this.queue.push(chunk)
    }
  }

  private settle(result: SoeResult | null): void {
    if (this.onFinal) {
      const cb = this.onFinal
      this.onFinal = null
      cb(result)
    }
    this.teardown()
  }

  private teardown(): void {
    this.closed = true
    this.processor?.disconnect()
    this.source?.disconnect()
    this.processor = null
    this.source = null
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close()
    this.ws = null
    this.queue = []
  }

  finish(): Promise<SoeResult | null> {
    return new Promise((resolve) => {
      if (this.closed || !this.ws) {
        resolve(this.finalResult)
        this.teardown()
        return
      }
      // Stop capturing but keep the socket for the verdict
      this.processor?.disconnect()
      this.source?.disconnect()
      const timer = setTimeout(() => this.settle(this.finalResult), FINAL_TIMEOUT_MS)
      this.onFinal = (r) => {
        clearTimeout(timer)
        resolve(r)
      }
      try {
        this.ws.send(JSON.stringify({ type: 'end' }))
      } catch {
        this.settle(this.finalResult)
      }
    })
  }

  cancel(): void {
    this.onFinal = null
    this.teardown()
  }
}

// Starts scoring against refText for a mic stream that is already live.
// A failed start says why, so the UI can tell "quota used up" from a glitch.
export async function startSoeSession(stream: MediaStream, refText: string): Promise<SoeStart> {
  const session = new WsSoeSession(stream, refText)
  try {
    const failed = await session.start()
    if (!failed) return { session }
    session.cancel()
    return { session: null, failure: failed.failure, limit: failed.limit }
  } catch {
    session.cancel()
    return { session: null, failure: 'error' }
  }
}
