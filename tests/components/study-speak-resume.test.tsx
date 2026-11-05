// @vitest-environment jsdom
// R03 with speech on: a read-aloud already scored (here: failed, which also
// counts a miss) is not asked again when the page is reopened — the word
// resumes at its spelling, and the miss is counted once.
import { test, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Study from '@/pages/Study'
import { useUserStore } from '@/store/userStore'
import { wordsLoaded } from '@/store/wordStore'
import type { SpeakOutcome } from '@/types'

vi.mock('@/services/recorder', () => ({
  recorder: { isSupported: () => true, start: vi.fn(), stop: vi.fn(), cancel: vi.fn() },
}))
vi.mock('@/services/tts', () => ({
  tts: { speak: vi.fn(), speakAll: vi.fn(), stop: vi.fn(), isSupported: () => true },
}))
// The real card records and scores; here it is one button per outcome
vi.mock('@/components/SentenceSpeak', () => ({
  default: ({ onContinue }: { onContinue: (o: SpeakOutcome, score: number | null) => void }) => (
    <div>
      <button onClick={() => onContinue('failed', 40)}>fake: 跟读没过</button>
      <button onClick={() => onContinue('passed', 95)}>fake: 跟读过关</button>
    </div>
  ),
  ExampleSentence: ({ example }: { example: string }) => <span>{example}</span>,
}))

beforeAll(() => wordsLoaded)
afterEach(cleanup)

const renderStudy = () =>
  render(
    <MemoryRouter initialEntries={['/study']}>
      <Routes>
        <Route path="/study" element={<Study />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>
  )

test('a failed read-aloud is counted once and not replayed on reopening (R03)', async () => {
  const s = useUserStore.getState()
  useUserStore.setState({
    progress: {},
    errorBank: [],
    dailyLog: {},
    currentSession: { date: s.getTodayDate(), wordIds: [1], currentIndex: 0, completed: false },
  })
  renderStudy()
  await screen.findByText('有能力的')
  fireEvent.click(screen.getByText('练习发音 →'))
  fireEvent.click(await screen.findByText('fake: 跟读没过'))
  await screen.findByPlaceholderText('输入英文单词...')
  expect(useUserStore.getState().progress[1].wrongCount).toBe(1)

  cleanup()
  renderStudy()
  // straight to the spelling: no card, no second read-aloud
  await screen.findByPlaceholderText('输入英文单词...')
  expect(screen.queryByText('fake: 跟读没过')).toBeNull()
  expect(screen.queryByText('练习发音 →')).toBeNull()
  const st = useUserStore.getState()
  expect(st.progress[1].wrongCount).toBe(1)
  expect(st.progress[1].speakFailCount).toBe(1)
  expect(st.errorBank).toEqual([1])
  expect(st.dailyLog[s.getTodayDate()]).toBe(1)

  fireEvent.change(screen.getByPlaceholderText('输入英文单词...'), { target: { value: 'able' } })
  fireEvent.click(screen.getByText('提交答案'))
  await screen.findByText('✅')
  expect(useUserStore.getState().currentSession!.results![1]).toEqual({ speak: 'failed', speakScore: 40, spelled: true, quiz: 'spell' })
})
