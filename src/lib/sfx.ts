import { acquireAudioContext } from '@/services/soe'

// Tiny synthesised sound effects (F8): no assets, played through the shared
// AudioContext. Callers check the "sounds" setting; this just plays.
export type Sfx = 'correct' | 'wrong' | 'complete' | 'badge'

const NOTES: Record<Sfx, [freq: number, at: number, dur: number][]> = {
  correct: [[880, 0, 0.08], [1318, 0.08, 0.14]],
  wrong: [[196, 0, 0.2]],
  complete: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.3]],
  badge: [[784, 0, 0.1], [988, 0.1, 0.1], [1319, 0.2, 0.25]],
}

export async function playSfx(kind: Sfx): Promise<void> {
  let ctx: AudioContext
  try {
    ctx = await acquireAudioContext()
  } catch {
    return
  }
  if (ctx.state !== 'running') return
  const t0 = ctx.currentTime
  for (const [freq, at, dur] of NOTES[kind]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = kind === 'wrong' ? 'triangle' : 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t0 + at)
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0 + at)
    osc.stop(t0 + at + dur + 0.05)
  }
}
