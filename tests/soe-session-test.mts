// R04: the scoring session's timing against a fake Web Audio graph, socket
// and signing endpoint. Audio read while the URL is still being signed must
// reach the scorer, in order; a take that ends before the socket opens must
// still be scored rather than fail on send().
import assert from 'node:assert'
import { test, vi } from 'vitest'

test('soe-session-test', async () => {
  const mem = new Map<string, string>()
  const stub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: { localStorage: stub }, configurable: true })

  // ── fake Web Audio: the processor is what the session taps ──
  class FakeNode {
    connected = false
    onaudioprocess: ((e: unknown) => void) | null = null
    connect() {
      this.connected = true
    }
    disconnect() {
      this.connected = false
    }
  }
  class FakeCtx {
    static processor: FakeNode | null = null
    state = 'running'
    sampleRate = 16000
    destination = {}
    resume() {
      return Promise.resolve()
    }
    createMediaStreamSource() {
      return new FakeNode()
    }
    createScriptProcessor() {
      FakeCtx.processor = new FakeNode()
      return FakeCtx.processor
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', { value: FakeCtx, configurable: true })
  // One block of mic audio, tagged by its sample value
  const speak = (v: number) =>
    FakeCtx.processor!.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(160).fill(v) } })
  const tagOf = (frame: unknown) => (typeof frame === 'string' ? frame : new Int16Array(frame as ArrayBuffer)[0])

  // ── fake socket: send() throws until open, like the real one ──
  class FakeWS {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    static last: FakeWS
    readyState = 0
    binaryType = ''
    sent: unknown[] = []
    onopen: (() => void) | null = null
    onmessage: ((e: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    onclose: (() => void) | null = null
    constructor(public url: string) {
      FakeWS.last = this
    }
    send(data: unknown) {
      if (this.readyState !== 1) throw new Error("InvalidStateError: Failed to execute 'send' on 'WebSocket'")
      this.sent.push(data)
    }
    close() {
      this.readyState = 3
    }
    open() {
      this.readyState = 1
      this.onopen?.()
    }
    verdict(score: number) {
      this.onmessage?.({ data: JSON.stringify({ code: 0, final: 1, result: { SuggestedScore: score, Words: [] } }) })
    }
  }
  Object.defineProperty(globalThis, 'WebSocket', { value: FakeWS, configurable: true })

  // ── signing endpoint that answers when told to ──
  let releaseSign: (() => void) | null = null
  let signStatus = 200
  globalThis.fetch = (async (url: string) => {
    if (url === '/api/device') return new Response(JSON.stringify({ token: 'dev-1' }))
    await new Promise<void>((r) => (releaseSign = r))
    return signStatus === 200
      ? new Response(JSON.stringify({ url: 'wss://soe.example/x' }))
      : new Response(JSON.stringify({ limit: 300 }), { status: signStatus })
  }) as typeof fetch
  const signed = async () => {
    await vi.waitFor(() => assert.ok(releaseSign, 'signing request sent'))
    releaseSign!()
    releaseSign = null
  }

  const { startSoeSession } = await import('../src/services/soe')
  const stream = {} as MediaStream

  // 1. The child reads while the URL is being signed: that audio is kept
  {
    FakeCtx.processor = null
    const starting = startSoeSession(stream, 'I like it.')
    await vi.waitFor(() => assert.ok(FakeCtx.processor?.connected, 'mic tapped before signing finishes'))
    speak(0.25) // first words, during signing
    await signed()
    const { session } = await starting
    assert.ok(session)
    const ws = FakeWS.last
    speak(0.5) // socket still connecting
    ws.open()
    speak(0.75) // live
    assert.deepEqual(ws.sent.map(tagOf), [8191, 16383, 24575], 'every block sent, in order')
    const result = session.finish()
    assert.equal(FakeCtx.processor!.connected, false, 'capture stops at finish')
    assert.equal(ws.sent.at(-1), '{"type":"end"}')
    ws.verdict(88)
    assert.equal((await result)?.score, 88)
  }

  // 2. A short take ends before the socket opens: wait, flush, then end
  {
    const starting = startSoeSession(stream, 'I like it.')
    await vi.waitFor(() => assert.ok(FakeCtx.processor?.connected))
    speak(0.25)
    await signed()
    const { session } = await starting
    const ws = FakeWS.last
    assert.equal(ws.readyState, 0)
    const result = session!.finish() // must not throw on a connecting socket
    assert.deepEqual(ws.sent, [], 'nothing sent before open')
    ws.open()
    assert.deepEqual(ws.sent.map(tagOf), [8191, '{"type":"end"}'], 'queued audio, then the end frame')
    ws.verdict(91)
    assert.equal((await result)?.score, 91, 'scored instead of an empty result')
  }

  // 3. The socket fails while connecting: no score, no hang
  {
    const starting = startSoeSession(stream, 'I like it.')
    await signed()
    const { session } = await starting
    const result = session!.finish()
    FakeWS.last.onerror!()
    assert.equal(await result, null)
  }

  // 4. Signing refused (quota): reported, and the mic tap is released
  {
    signStatus = 429
    const starting = startSoeSession(stream, 'I like it.')
    await vi.waitFor(() => assert.ok(FakeCtx.processor?.connected))
    await signed()
    const res = await starting
    assert.deepEqual([res.session, res.failure, res.limit], [null, 'quota', 300])
    assert.equal(FakeCtx.processor!.connected, false, 'tap disconnected when there is nothing to score')
  }
})
