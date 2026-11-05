// @vitest-environment jsdom
// SentenceSpeak state machine with recorder/scorer mocked: record → stop →
// score → continue; below the bar; quota exhausted; unscored takes; R11 breakdown.
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SentenceSpeak from '@/components/SentenceSpeak'
import { startSoeSession } from '@/services/soe'
import type { Word } from '@/types'

vi.mock('@/services/recorder', () => ({
  recorder: {
    isSupported: () => true,
    start: vi.fn(async () => ({}) as MediaStream),
    stop: vi.fn(async () => new Blob(['x'], { type: 'audio/webm' })),
    cancel: vi.fn(),
  },
}))
vi.mock('@/services/tts', () => ({
  tts: { speak: vi.fn(), speakAll: vi.fn(), stop: vi.fn(), isSupported: () => true },
}))
vi.mock('@/services/soe', () => ({
  unlockAudioContext: vi.fn(),
  startSoeSession: vi.fn(),
}))

const word: Word = {
  id: 1, word: 'able', pos: 'adj', pos_cn: '形容词', definition: '有能力的',
  example: 'She is able to speak two languages.', example_cn: '她能说两种语言。',
}
const scored = (score: number, words = [{ word: 'She', score: 98 }, { word: 'able', score: 40 }, { word: 'speak', score: 55 }]) =>
  ({ session: { finish: async () => ({ score, words }), cancel: vi.fn() } }) as never

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
  HTMLMediaElement.prototype.pause = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined)
  vi.mocked(startSoeSession).mockReset()
})
afterEach(cleanup)

const setup = (passScore = 90) => {
  const onContinue = vi.fn()
  const onAbort = vi.fn()
  render(
    <SentenceSpeak word={word} passScore={passScore} continueLabel="继续拼写 →" skipLabel="跳过发音" onContinue={onContinue} onAbort={onAbort} />
  )
  return { onContinue, onAbort }
}

async function takeOnce() {
  fireEvent.click(screen.getByLabelText('开始录音'))
  fireEvent.click(await screen.findByLabelText('停止录音'))
}

test('a take at or above the bar can continue as passed', async () => {
  vi.mocked(startSoeSession).mockResolvedValueOnce(scored(95))
  const { onContinue } = setup()
  expect(screen.getByText('读完句子才能继续哦')).toBeTruthy()
  expect(screen.queryByText('跳过发音')).toBeNull()
  expect(screen.queryByText('继续拼写 →')).toBeNull()
  await takeOnce()
  await screen.findByText('95分')
  expect(screen.getByText('🎉 读得真棒！')).toBeTruthy()
  fireEvent.click(screen.getByText('继续拼写 →'))
  expect(onContinue).toHaveBeenCalledWith('passed', 95)
})

test('below the bar continues as failed, and the bar follows the setting', async () => {
  vi.mocked(startSoeSession).mockResolvedValueOnce(scored(75))
  const { onContinue } = setup(80)
  await takeOnce()
  await screen.findByText('75分')
  expect(screen.getByText(/没到 80 分/)).toBeTruthy()
  fireEvent.click(screen.getByText('继续拼写 →'))
  expect(onContinue).toHaveBeenCalledWith('failed', 75)
})

test('after three takes below the bar the weakest words get their own buttons (R11)', async () => {
  vi.mocked(startSoeSession).mockResolvedValue(scored(70))
  setup()
  await takeOnce()
  await screen.findByText('70分')
  expect(screen.queryByText(/先单独听/)).toBeNull()
  await takeOnce()
  await screen.findByText('70分')
  expect(screen.queryByText(/先单独听/)).toBeNull()
  await takeOnce()
  await screen.findByText(/先单独听/)
  const labels = screen.getAllByRole('button').map((b) => b.textContent ?? '')
  expect(labels.some((t) => t.includes('able') && t.includes('40'))).toBe(true)
  expect(labels.some((t) => t.includes('speak') && t.includes('55'))).toBe(true)
  expect(labels.some((t) => t.includes('She') && t.includes('98'))).toBe(false)
})

test("today's scoring budget used up ends the session instead of counting a failure", async () => {
  vi.mocked(startSoeSession).mockResolvedValueOnce({ session: null, failure: 'quota', limit: 300 } as never)
  const { onAbort, onContinue } = setup()
  await takeOnce()
  await screen.findByText(/发音练习次数已经用完了/)
  expect(screen.getByText(/每天 300 次/)).toBeTruthy()
  expect((screen.getByLabelText('开始录音') as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByText('返回主界面'))
  expect(onAbort).toHaveBeenCalled()
  expect(onContinue).not.toHaveBeenCalled()
})

test('three unscored takes explain the problem and abort', async () => {
  vi.mocked(startSoeSession).mockResolvedValue({ session: null, failure: 'error' } as never)
  const { onAbort } = setup()
  await takeOnce()
  await screen.findByText(/第 1\/3 次/)
  expect(screen.queryByText('继续拼写 →')).toBeNull()
  await takeOnce()
  await screen.findByText(/第 2\/3 次/)
  await takeOnce()
  await screen.findByText(/连续 3 次没打上分/)
  fireEvent.click(screen.getByText('返回主界面'))
  expect(onAbort).toHaveBeenCalled()
})

// R07: the mic takes a moment to open (permission prompt, device warm-up)
test('a second tap while the mic is opening is ignored (R07)', async () => {
  const { recorder } = await import('@/services/recorder')
  let open!: (s: MediaStream) => void
  vi.mocked(recorder.start).mockClear().mockImplementationOnce(() => new Promise((r) => (open = r)))
  vi.mocked(startSoeSession).mockResolvedValueOnce(scored(95))
  setup()
  const mic = screen.getByLabelText('开始录音')
  fireEvent.click(mic)
  fireEvent.click(mic)
  expect(recorder.start).toHaveBeenCalledTimes(1)
  expect(screen.getByText('正在打开麦克风…')).toBeTruthy()
  expect((mic as HTMLButtonElement).disabled).toBe(true)
  open({} as MediaStream)
  await screen.findByLabelText('停止录音')
  expect(startSoeSession).toHaveBeenCalledTimes(1)
})

test('leaving while the mic is opening starts no recording or scoring (R07)', async () => {
  const { recorder } = await import('@/services/recorder')
  let open!: (s: MediaStream) => void
  vi.mocked(recorder.start).mockImplementationOnce(() => new Promise((r) => (open = r)))
  vi.mocked(recorder.cancel).mockClear()
  setup()
  fireEvent.click(screen.getByLabelText('开始录音'))
  cleanup() // the child navigated away
  expect(recorder.cancel).toHaveBeenCalled()
  open({} as MediaStream)
  await new Promise((r) => setTimeout(r, 0))
  expect(startSoeSession).not.toHaveBeenCalled()
  expect(vi.mocked(recorder.cancel).mock.calls.length).toBeGreaterThanOrEqual(2)
})
