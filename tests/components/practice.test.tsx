// @vitest-environment jsdom
// Mixed practice (F4): mode picker, English → Chinese choice, dictation
import { test, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Practice from '@/pages/Practice'
import { useUserStore } from '@/store/userStore'
import { useWordStore, wordsLoaded } from '@/store/wordStore'

vi.mock('@/services/tts', () => ({
  tts: { speak: vi.fn(), speakAll: vi.fn(), stop: vi.fn(), isSupported: () => true },
}))

beforeAll(() => wordsLoaded)
afterEach(cleanup)

const renderPractice = () =>
  render(
    <MemoryRouter>
      <Practice />
    </MemoryRouter>
  )

// The question's word is whichever entry's definition is among the options
const wordOnScreen = () => {
  const { words } = useWordStore.getState()
  const heading = document.querySelector('.text-3xl')?.textContent ?? ''
  return words.find((w) => w.word === heading || w.word.startsWith(heading + ' '))!
}

test('English → Chinese: four meanings, the right one scores', async () => {
  useUserStore.setState({ progress: {}, errorBank: [] })
  renderPractice()
  expect(screen.getByText('混合练习')).toBeTruthy()
  fireEvent.click(screen.getByText('英 → 中'))
  fireEvent.click(screen.getByText('开始 10 题'))
  await screen.findByText('1 / 10')
  const word = wordOnScreen()
  const options = screen.getAllByRole('button').filter((b) => b.className.includes('rounded-2xl border p-4'))
  expect(options.length).toBe(4)
  expect(options.some((b) => b.textContent === word.definition)).toBe(true)
  fireEvent.click(options.find((b) => b.textContent === word.definition)!)
  expect(screen.getByText('✅ 回答正确！')).toBeTruthy()
  expect(useUserStore.getState().progress[word.id].correctCount).toBe(1)
  fireEvent.click(screen.getByText('下一题 →'))
  await screen.findByText('2 / 10')
  // a wrong pick lands in the error bank
  const w2 = wordOnScreen()
  const wrong = screen.getAllByRole('button').filter((b) => b.className.includes('rounded-2xl border p-4')).find((b) => b.textContent !== w2.definition)!
  fireEvent.click(wrong)
  expect(screen.getByText(`❌ 正确答案是 "${w2.definition}"`)).toBeTruthy()
  expect(useUserStore.getState().errorBank).toContain(w2.id)
})

test('dictation: hear, spell, submit', async () => {
  useUserStore.setState({ progress: {}, errorBank: [] })
  renderPractice()
  fireEvent.click(screen.getByText('听写'))
  fireEvent.click(screen.getByText('开始 10 题'))
  await screen.findByText('🎧 听写')
  expect(screen.getByLabelText('再听一遍')).toBeTruthy()
  // the word is not visible; spell something wrong to reveal it
  fireEvent.change(screen.getByPlaceholderText('输入英文单词...'), { target: { value: 'zzzz' } })
  fireEvent.click(screen.getByText('提交答案'))
  await screen.findByText('❌')
  expect(screen.getByText('zzzz')).toBeTruthy()
  expect(useUserStore.getState().errorBank.length).toBe(1)
  fireEvent.click(screen.getByText('下一题 →'))
  await screen.findByText('2 / 10')
  expect(screen.getByText('🎧 听写')).toBeTruthy()
})

test('the chosen mode is remembered', () => {
  renderPractice()
  fireEvent.click(screen.getByText('中 → 英'))
  fireEvent.click(screen.getByText('开始 10 题'))
  cleanup()
  renderPractice()
  expect(screen.getByText('中 → 英').closest('button')!.getAttribute('aria-pressed')).toBe('true')
})
