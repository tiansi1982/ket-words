// @vitest-environment jsdom
// Daily study end to end with the recorder unsupported (show → spell →
// result → next → summary), against the real stores and word list.
import { test, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Study from '@/pages/Study'
import { useUserStore } from '@/store/userStore'
import { wordsLoaded } from '@/store/wordStore'

vi.mock('@/services/recorder', () => ({
  recorder: { isSupported: () => false, start: vi.fn(), stop: vi.fn(), cancel: vi.fn() },
}))
vi.mock('@/services/tts', () => ({
  tts: { speak: vi.fn(), speakAll: vi.fn(), stop: vi.fn(), isSupported: () => true },
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

const spell = (text: string) => {
  fireEvent.change(screen.getByPlaceholderText('输入英文单词...'), { target: { value: text } })
  fireEvent.click(screen.getByText('提交答案'))
}

test('two-word session: right, wrong, then the summary', async () => {
  const s = useUserStore.getState()
  useUserStore.setState({
    progress: {},
    errorBank: [],
    dailyLog: {},
    currentSession: { date: s.getTodayDate(), wordIds: [1, 2], currentIndex: 0, completed: false },
  })
  renderStudy()

  // word 1 (able): new word, spelled correctly
  await screen.findByText('有能力的')
  expect(screen.getByText('新词')).toBeTruthy()
  expect(screen.getByText('1 / 2')).toBeTruthy()
  fireEvent.click(screen.getByText('开始拼写 →'))
  spell('Able ')
  await screen.findByText('✅')
  expect(useUserStore.getState().progress[1].correctCount).toBe(1)
  fireEvent.click(screen.getByText('下一个 →'))

  // word 2 (about): spelled wrong → error bank
  await screen.findByText('大约；关于')
  expect(useUserStore.getState().currentSession!.currentIndex).toBe(1)
  fireEvent.click(screen.getByText('开始拼写 →'))
  spell('abot')
  await screen.findByText('❌')
  expect(screen.getByText('abot')).toBeTruthy()
  expect(useUserStore.getState().errorBank).toEqual([2])
  fireEvent.click(screen.getByText('完成学习 🎉'))

  // summary (R7)
  await screen.findByText('今日学习完成！')
  expect(screen.getByText(/拼写对 1 个/)).toBeTruthy()
  expect(screen.getByText(/今天有 1 个词进了错题本/)).toBeTruthy()
  const st = useUserStore.getState()
  expect(st.currentSession!.completed).toBe(true)
  expect(st.currentSession!.results).toEqual({ 1: { spelled: true }, 2: { spelled: false } })
  expect(st.dailyLog[s.getTodayDate()]).toBe(2)
})

test('a stale session with an unknown id is pruned instead of stranding the page (R2)', async () => {
  const s = useUserStore.getState()
  useUserStore.setState({
    progress: { 3: { wordId: 3, status: 'mastered', correctCount: 3, wrongCount: 0, lastStudied: Date.now() - 3 * 86400000, srsLevel: 0, dueDate: s.getTodayDate() } },
    errorBank: [],
    currentSession: { date: s.getTodayDate(), wordIds: [99999, 3], currentIndex: 0, completed: false },
  })
  renderStudy()
  await screen.findByText('在上面') // word 3 (above) is on screen, not a blank card
  expect(screen.getByText(/复习 · 上次 3 天前/)).toBeTruthy()
  expect(useUserStore.getState().currentSession!.wordIds).toEqual([3])
  expect(screen.getByText('1 / 1')).toBeTruthy()
})
