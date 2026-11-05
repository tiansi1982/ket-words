// Recorder service: start/stop must produce a playable blob and always
// release the mic — a leaked audio track keeps the mic indicator on and can
// wedge iOS pages (the same class of bug that killed Web Speech recognition).
import assert from 'node:assert'
import { test } from 'vitest'

test('recorder-test', async () => {

/* eslint-disable @typescript-eslint/no-explicit-any */
class FakeTrack {
  stopped = false
  stop() {
    this.stopped = true
  }
}

class FakeStream {
  tracks = [new FakeTrack()]
  getTracks() {
    return this.tracks
  }
}

class FakeMediaRecorder {
  static last: FakeMediaRecorder
  state: 'inactive' | 'recording' = 'inactive'
  mimeType: string
  ondataavailable: ((e: any) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public stream: FakeStream, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? ''
    FakeMediaRecorder.last = this
  }
  static isTypeSupported(t: string) {
    return t === 'audio/webm'
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

let denyMic = false
let lastStream: FakeStream
// When set, getUserMedia waits for this (an open permission prompt)
let gate: Promise<void> | null = null
Object.defineProperty(globalThis, 'MediaRecorder', { value: FakeMediaRecorder, configurable: true })
Object.defineProperty(globalThis, 'navigator', {
  value: {
    mediaDevices: {
      getUserMedia: async () => {
        if (denyMic) throw new Error('NotAllowedError')
        const stream = new FakeStream()
        lastStream = stream
        if (gate) await gate
        return stream
      },
    },
  },
  configurable: true,
})

const { recorder } = await import('../src/services/recorder')

// ── 1. supported with these globals ──
assert.equal(recorder.isSupported(), true)

// ── 2. start → stop yields a blob and releases the mic ──
{
  const stream = await recorder.start()
  assert.equal(stream, lastStream as unknown, 'start() hands back the live stream for tapping')
  const rec = FakeMediaRecorder.last
  assert.equal(rec.state, 'recording')
  assert.equal(rec.mimeType, 'audio/webm', 'picks a supported container')
  const blob = await recorder.stop()
  assert.ok(blob.size > 0, 'recording has data')
  assert.equal(blob.type, 'audio/webm')
  assert.equal(lastStream.tracks[0].stopped, true, 'mic track released after stop')
}

// ── 3. stop without an active recording rejects instead of hanging ──
await assert.rejects(recorder.stop(), /not recording/)

// ── 4. cancel mid-recording releases the mic, and a fresh start still works ──
{
  await recorder.start()
  const stream1 = lastStream
  recorder.cancel()
  assert.equal(stream1.tracks[0].stopped, true, 'mic track released after cancel')
  await recorder.start()
  assert.notEqual(lastStream, stream1, 'new session gets a fresh stream')
  const blob = await recorder.stop()
  assert.ok(blob.size > 0)
}

// ── 5. permission denied rejects (component shows the mic-permission hint) ──
{
  denyMic = true
  await assert.rejects(recorder.start(), /NotAllowedError/)
  denyMic = false
}

// ── 6. R07: cancelled while the permission prompt is open → mic released ──
{
  let allow!: () => void
  gate = new Promise((r) => (allow = r))
  const before = FakeMediaRecorder.last
  const starting = recorder.start()
  const pending = lastStream
  recorder.cancel() // the page went away
  allow()
  await assert.rejects(starting, /cancelled/)
  assert.equal(pending.tracks[0].stopped, true, 'late stream stopped, mic not left on')
  assert.equal(FakeMediaRecorder.last, before, 'no recorder started on it')
  gate = null
}

// ── 7. R07: a second start while the first waits supersedes it ──
{
  let allow!: () => void
  gate = new Promise((r) => (allow = r))
  const first = recorder.start()
  const firstStream = lastStream
  const second = recorder.start()
  const secondStream = lastStream
  allow()
  await assert.rejects(first, /cancelled/)
  assert.equal(await second, secondStream as unknown)
  assert.equal(firstStream.tracks[0].stopped, true, 'first stream released')
  assert.equal(secondStream.tracks[0].stopped, false, 'second one records')
  assert.equal(FakeMediaRecorder.last.stream, secondStream)
  await recorder.stop()
  assert.equal(secondStream.tracks[0].stopped, true)
  gate = null
}

// ── 8. a recorder that fails to start doesn't keep the mic ──
{
  const Orig = FakeMediaRecorder.prototype.start
  FakeMediaRecorder.prototype.start = () => {
    throw new Error('NotSupportedError')
  }
  await assert.rejects(recorder.start(), /NotSupportedError/)
  assert.equal(lastStream.tracks[0].stopped, true, 'released on a failed start')
  FakeMediaRecorder.prototype.start = Orig
}

console.log('✅ recorder assertions passed')
})
