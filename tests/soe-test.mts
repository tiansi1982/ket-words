// SOE plumbing: signed-URL generation (functions/api/soe-url.ts), result
// parsing and PCM downsampling (src/services/soe.ts).
import assert from 'node:assert'
import { createHmac } from 'node:crypto'

const { signSoeUrl } = await import('../functions/api/soe-url')
const { parseSoeResult, toPcm16k } = await import('../src/services/soe')

// ── 1. signed URL: shape, sorted params, signature verifiable independently ──
{
  const now = 1752900000
  const nonce = 123456789
  const voiceId = 'test-voice-id'
  const { url, voiceId: vid } = await signSoeUrl(
    '1300000000', 'AKIDtest', 'secretkeytest', 'I like it.', now, nonce, voiceId
  )
  assert.equal(vid, voiceId)
  assert.ok(url.startsWith('wss://soe.cloud.tencent.com/soe/api/1300000000?'), 'host + appid path')

  const u = new URL(url)
  assert.equal(u.searchParams.get('ref_text'), 'I like it.')
  assert.equal(u.searchParams.get('server_engine_type'), '16k_en')
  assert.equal(u.searchParams.get('eval_mode'), '1')
  assert.equal(u.searchParams.get('score_coeff'), '1.0')
  assert.equal(u.searchParams.get('voice_format'), '0')
  assert.equal(u.searchParams.get('timestamp'), String(now))
  assert.equal(u.searchParams.get('expired'), String(now + 300))

  // Recompute the signature with node:crypto over the documented raw string:
  // sorted key=value pairs, values NOT url-encoded, appid in the path
  const params: Record<string, string> = {
    secretid: 'AKIDtest',
    timestamp: String(now),
    expired: String(now + 300),
    nonce: String(nonce),
    server_engine_type: '16k_en',
    voice_id: voiceId,
    voice_format: '0',
    eval_mode: '1',
    score_coeff: '1.0',
    ref_text: 'I like it.',
  }
  const raw = `soe.cloud.tencent.com/soe/api/1300000000?${Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&')}`
  const expected = createHmac('sha1', 'secretkeytest').update(raw).digest('base64')
  assert.equal(u.searchParams.get('signature'), expected, 'WebCrypto HMAC-SHA1 matches node:crypto')

  // signature must come last so the signed prefix equals the raw string's param order
  assert.ok(url.endsWith(`signature=${encodeURIComponent(expected)}`))
}

// ── 2. result parsing: classic SOE PascalCase SentenceInfo ──
{
  const r = parseSoeResult({
    SuggestedScore: 86.5,
    PronAccuracy: 84.2,
    Words: [
      { Word: 'I', PronAccuracy: 95.1 },
      { Word: 'like', PronAccuracy: 88 },
      { Word: 'it', PronAccuracy: -1 }, // Tencent uses -1 for "not detected"… keep raw? clamp
    ],
  })
  assert.ok(r)
  assert.equal(r.score, 87, 'overall = rounded SuggestedScore')
  assert.deepEqual(r.words.map((w) => w.word), ['I', 'like', 'it'])
  assert.equal(r.words[0].score, 95)
  assert.equal(r.words[2].score, 0, 'negative sentinel clamps to 0')
}
assert.equal(parseSoeResult(null), null)
assert.equal(parseSoeResult({}), null)
assert.equal(parseSoeResult({ SuggestedScore: 'nope' }), null)

// ── 3. PCM downsample: 48k float → 16k int16, length and amplitude ──
{
  const from = 48000
  const seconds = 0.1
  const input = new Float32Array(from * seconds)
  for (let i = 0; i < input.length; i++) input[i] = Math.sin((2 * Math.PI * 440 * i) / from) * 0.5
  const out = toPcm16k(input, from)
  assert.equal(out.length, 1600, '0.1s at 16k')
  const peak = Math.max(...Array.from(out).map(Math.abs))
  assert.ok(peak > 0.45 * 0x7fff && peak <= 0.55 * 0x7fff, `peak ~50% full scale, got ${peak}`)
}
{
  // Clipping stays in int16 range
  const loud = new Float32Array(4800).fill(1.5)
  const out = toPcm16k(loud, 48000)
  assert.ok(Array.from(out).every((v) => v === 0x7fff), 'over-range clamps to max')
}

console.log('✅ soe assertions passed')
