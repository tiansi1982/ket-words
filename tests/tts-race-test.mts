// R08: the TTS player must not start a clip after stop() — the audio URL is
// a SHA-1 of the text, computed asynchronously, and a stop() landing in that
// gap (e.g. the child tapping record) used to let the clip play anyway.
import assert from 'node:assert'
import { test, vi } from 'vitest'

test('tts-race-test', async () => {
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })

  // Clips the player creates; play() never ends on its own
  const clips: { src: string; playing: boolean }[] = []
  class FakeAudio {
    onended: (() => void) | null = null
    onerror: (() => void) | null = null
    clip: { src: string; playing: boolean }
    constructor(src: string) {
      this.clip = { src, playing: false }
      clips.push(this.clip)
    }
    play() {
      this.clip.playing = true
      return Promise.resolve()
    }
    pause() {
      this.clip.playing = false
    }
  }
  Object.defineProperty(globalThis, 'Audio', { value: FakeAudio, configurable: true })

  // Hashing waits until released, one pending digest per call; the digest
  // itself is a fixed fake so releasing completes within one tick
  const pending: (() => void)[] = []
  let n = 0
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async () => {
    const tag = ++n
    await new Promise<void>((r) => pending.push(r))
    return new Uint8Array(20).fill(tag).buffer
  })
  const flush = () => new Promise((r) => setTimeout(r, 0))
  const release = async () => {
    while (pending.length) pending.shift()!()
    await flush()
  }

  const { tts } = await import('../src/services/tts')

  // 1. stop() while the URL is being computed: nothing plays
  tts.speak('first text')
  await flush()
  tts.stop()
  await release()
  assert.equal(clips.length, 0, 'no clip started after stop()')

  // 2. a newer speak() supersedes one still hashing: only the newer plays
  tts.speak('older text')
  await flush()
  tts.speak('newer text')
  await release()
  assert.equal(clips.length, 1, 'only one clip created')
  assert.equal(clips.filter((c) => c.playing).length, 1)

  // 3. and stop() still reaches the clip that is playing — a stale task
  // finishing must not have dropped its cancel handle
  tts.stop()
  assert.equal(clips[0].playing, false, 'playing clip paused by stop()')
})
