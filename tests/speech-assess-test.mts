// Regression: recognition engines that end without firing onresult/onerror
// (common on iOS Safari) must resolve assess() instead of hanging the UI
// on "正在聆听..." forever.
import assert from 'node:assert'

/* eslint-disable @typescript-eslint/no-explicit-any */
class FakeRecognition {
  static last: FakeRecognition
  static throwOnStart = false
  lang = ''
  interimResults = false
  maxAlternatives = 1
  started = false
  stopped = false
  aborted = false
  onresult: ((e: any) => void) | null = null
  onerror: ((e: any) => void) | null = null
  onnomatch: (() => void) | null = null
  onend: (() => void) | null = null
  constructor() {
    FakeRecognition.last = this
  }
  start() {
    if (FakeRecognition.throwOnStart) throw new Error('start failed')
    this.started = true
  }
  stop() {
    this.stopped = true
  }
  abort() {
    this.aborted = true
    this.onerror?.({ error: 'aborted' })
    this.onend?.()
  }
}

Object.defineProperty(globalThis, 'window', {
  value: { webkitSpeechRecognition: FakeRecognition },
  configurable: true,
})

const { speechAssessment } = await import('../src/services/speechAssessment')

// A hung promise would stall the suite silently — fail loudly instead
function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label}: promise never settled (bug regressed)`)), 1000)
    ),
  ])
}

// ── 1. bare onend (the reported bug) resolves an empty result ──
{
  const p = withTimeout(speechAssessment.assess('I like it.'), 'bare onend')
  const rec = FakeRecognition.last
  assert.equal(rec.started, true)
  rec.onend!()
  const r = await p
  assert.deepEqual(r, { transcript: '', score: 0, passed: false }, 'onend without result → empty assessment')
  assert.equal(rec.aborted, true, 'settling must tear the session down for real')
}

// ── 2. onresult picks the best alternative; the trailing onend is a no-op ──
{
  const p = withTimeout(speechAssessment.assess('I like it.'), 'onresult')
  const rec = FakeRecognition.last
  rec.onresult!({ results: [[{ transcript: 'we like tea' }, { transcript: 'i like it' }]] })
  rec.onend!() // engines fire onend after onresult — must not clobber the result
  const r = await p
  assert.equal(r.transcript, 'i like it')
  assert.equal(r.score, 100)
  assert.equal(r.passed, true)
}

// ── 3. no-speech resolves empty; other errors reject ──
{
  const p = withTimeout(speechAssessment.assess('hello'), 'no-speech')
  FakeRecognition.last.onerror!({ error: 'no-speech' })
  assert.equal((await p).passed, false)
}
{
  const p = withTimeout(speechAssessment.assess('hello'), 'network error')
  const rec = FakeRecognition.last
  rec.onerror!({ error: 'network' })
  rec.onend!()
  await assert.rejects(p, /network/, 'real errors still reject')
}

// ── 4. onnomatch resolves empty ──
{
  const p = withTimeout(speechAssessment.assess('hello'), 'nomatch')
  const rec = FakeRecognition.last
  rec.onnomatch!()
  rec.onend!()
  assert.deepEqual(await p, { transcript: '', score: 0, passed: false })
}

// ── 5. cancel() aborts: rejects (component resets to idle), no hang ──
{
  const p = withTimeout(speechAssessment.assess('hello'), 'cancel')
  speechAssessment.cancel()
  await assert.rejects(p, /aborted/)
}

// ── 6. regression (iOS page freeze): a wedged session that never settles on
// its own must be killed when a new assess() starts, and the retry must work ──
{
  const p1 = withTimeout(speechAssessment.assess('hello'), 'wedged session')
  const rec1 = FakeRecognition.last
  const p2 = withTimeout(speechAssessment.assess('hello'), 'retry after wedge')
  const rec2 = FakeRecognition.last
  assert.notEqual(rec1, rec2, 'retry gets a fresh session')
  assert.equal(rec1.aborted, true, 'new assess() aborts the wedged session')
  await assert.rejects(p1, /aborted/)
  rec2.onresult!({ results: [[{ transcript: 'hello' }]] })
  assert.equal((await p2).passed, true, 'retry works after killing the wedge')
}

// ── 7. a synchronous start() failure rejects instead of hanging ──
{
  FakeRecognition.throwOnStart = true
  const p = withTimeout(speechAssessment.assess('hello'), 'start throws')
  FakeRecognition.throwOnStart = false
  await assert.rejects(p, /start failed/)
}

console.log('✅ speech assessment assertions passed')
