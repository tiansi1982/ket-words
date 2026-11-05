// @vitest-environment jsdom
// Error bank list and a practice round (R9) with the recorder unsupported.
import { test, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ErrorList from '@/pages/ErrorList'
import ErrorBank from '@/pages/ErrorBank'
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

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/error-bank" element={<ErrorList />} />
        <Route path="/error-bank/practice" element={<ErrorBank />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>
  )

const seed = () =>
  useUserStore.setState({
    errorBank: [1, 2],
    errorSession: null,
    progress: {
      1: { wordId: 1, status: 'learning', correctCount: 0, wrongCount: 1, lastStudied: 1, consecutiveWrong: 1 },
      2: { wordId: 2, status: 'learning', correctCount: 0, wrongCount: 2, lastStudied: 2, consecutiveWrong: 2, speakFailCount: 1 },
    },
  })

test('list: repeat offenders first, badges, start button', async () => {
  seed()
  renderAt('/error-bank')
  await screen.findByText('错题本')
  expect(screen.getByText('2 个')).toBeTruthy()
  const rows = screen.getAllByLabelText(/^朗读 /).map((b) => b.getAttribute('aria-label'))
  expect(rows).toEqual(['朗读 about', '朗读 able'])
  expect(screen.getByText('连错 2')).toBeTruthy()
  expect(screen.getByText('🎤 没过 1')).toBeTruthy()
  expect(screen.getByText('练 2 个')).toBeTruthy()
  // two-step removal
  fireEvent.click(screen.getByLabelText('移除 able'))
  fireEvent.click(screen.getByText('确认移除'))
  expect(useUserStore.getState().errorBank).toEqual([2])
})

test('a round: clear one, miss one, recap, round closed on leaving', async () => {
  seed()
  renderAt('/error-bank/practice')
  // round started on entry, hardest word (about) first
  await screen.findByText('大约；关于')
  expect(screen.getByText('错题练习 1/2')).toBeTruthy()
  fireEvent.change(screen.getByPlaceholderText('输入英文单词...'), { target: { value: 'about' } })
  fireEvent.click(screen.getByText('提交答案'))
  await screen.findByText('已从错题本移除 ✓')
  expect(useUserStore.getState().errorBank).toEqual([1])
  expect(screen.queryByText('删除错题')).toBeNull()
  fireEvent.click(screen.getByText('下一个 →'))

  await screen.findByText('有能力的')
  fireEvent.change(screen.getByPlaceholderText('输入英文单词...'), { target: { value: 'abel' } })
  fireEvent.click(screen.getByText('提交答案'))
  await screen.findByText('❌')
  fireEvent.click(screen.getByText('看看结果 🎉'))

  await screen.findByText('这轮练完了！')
  expect(screen.getByText(/2 个里移出了/)).toBeTruthy()
  expect(screen.getByText(/错题本还剩 1 个/)).toBeTruthy()
  expect(useUserStore.getState().errorSession!.cleared).toEqual([2])
  fireEvent.click(screen.getByText('返回错题本'))
  expect(useUserStore.getState().errorSession).toBeNull()
})

test('an unfinished round resumes where it stopped', async () => {
  seed()
  useUserStore.setState({ errorSession: { wordIds: [2, 1], currentIndex: 1, cleared: [] } })
  renderAt('/error-bank')
  await screen.findByText(/上一轮还没练完（1\/2）/)
  expect(screen.getByText('继续')).toBeTruthy()
  cleanup()
  renderAt('/error-bank/practice')
  await screen.findByText('有能力的')
  expect(screen.getByText('错题练习 2/2')).toBeTruthy()
})

// R03: answers count when given, so reopening a round mid-word resumes the
// word (even one that already left the bank) instead of counting it again
test('reopening a round after an answer resumes on the result, counted once (R03)', async () => {
  seed()
  renderAt('/error-bank/practice')
  await screen.findByText('大约；关于')
  fireEvent.change(screen.getByPlaceholderText('输入英文单词...'), { target: { value: 'about' } })
  fireEvent.click(screen.getByText('提交答案'))
  await screen.findByText('已从错题本移除 ✓')
  for (let i = 0; i < 2; i++) {
    cleanup()
    renderAt('/error-bank/practice')
    // still this word's result, though it is no longer in the bank
    await screen.findByText('已从错题本移除 ✓')
    expect(screen.queryByPlaceholderText('输入英文单词...')).toBeNull()
  }
  expect(useUserStore.getState().progress[2].correctCount).toBe(1)
  fireEvent.click(screen.getByText('下一个 →'))

  await screen.findByText('有能力的')
  fireEvent.change(screen.getByPlaceholderText('输入英文单词...'), { target: { value: 'abel' } })
  fireEvent.click(screen.getByText('提交答案'))
  await screen.findByText('❌')
  cleanup()
  renderAt('/error-bank/practice')
  await screen.findByText('❌')
  expect(useUserStore.getState().progress[1].wrongCount).toBe(2)
  fireEvent.click(screen.getByText('看看结果 🎉'))
  await screen.findByText('这轮练完了！')
  // the resumed word still counts as cleared in the recap
  expect(useUserStore.getState().errorSession!.cleared).toEqual([2])
})
