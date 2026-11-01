// @vitest-environment jsdom
// Word browser (F1) and bulk mark-known / reset (F2)
import { test, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Words from '@/pages/Words'
import { useUserStore } from '@/store/userStore'
import { wordsLoaded } from '@/store/wordStore'

vi.mock('@/services/tts', () => ({
  tts: { speak: vi.fn(), speakAll: vi.fn(), stop: vi.fn(), isSupported: () => true },
}))

beforeAll(() => wordsLoaded)
afterEach(cleanup)

const renderWords = () =>
  render(
    <MemoryRouter>
      <Words />
    </MemoryRouter>
  )

const rowButtons = () => screen.getAllByRole('button').filter((b) => b.className.includes('h-full w-full'))

test('search and status filters narrow the list; counts shown', async () => {
  const s = useUserStore.getState()
  useUserStore.setState({
    parentPin: null,
    errorBank: [2],
    progress: {
      2: { wordId: 2, status: 'learning', correctCount: 1, wrongCount: 1, lastStudied: Date.now() },
      3: { wordId: 3, status: 'mastered', correctCount: 3, wrongCount: 0, lastStudied: Date.now(), srsLevel: 0, dueDate: s.getTodayDate() },
    },
  })
  renderWords()
  expect(screen.getByText('1574 / 1574')).toBeTruthy()
  // only a window of rows is in the DOM
  expect(rowButtons().length).toBeLessThan(60)

  fireEvent.change(screen.getByLabelText('搜索单词'), { target: { value: 'abov' } })
  expect(screen.getByText('1 / 1574')).toBeTruthy()
  expect(screen.getByText('above')).toBeTruthy()
  expect(within(rowButtons()[0]).getByText('待复习')).toBeTruthy()

  fireEvent.change(screen.getByLabelText('搜索单词'), { target: { value: '关于' } })
  expect(screen.getByText('about')).toBeTruthy()
  fireEvent.click(screen.getByLabelText('清空搜索'))

  fireEvent.click(screen.getByRole('button', { name: /^学习中/ }))
  expect(screen.getByText('1 / 1574')).toBeTruthy()
  expect(screen.getByText('about')).toBeTruthy()
  expect(screen.getByLabelText('在错题本')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: /^错题/ }))
  expect(screen.getByText('about')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^已巩固/ }))
  expect(screen.getByText('没有符合条件的单词')).toBeTruthy()
})

test('detail sheet shows the record and marks one word known', async () => {
  useUserStore.setState({ parentPin: null, errorBank: [], progress: {} })
  renderWords()
  fireEvent.change(screen.getByLabelText('搜索单词'), { target: { value: 'able' } })
  fireEvent.click(rowButtons()[0])
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('有能力的')).toBeTruthy()
  expect(within(dialog).getByText('新词')).toBeTruthy()
  fireEvent.click(within(dialog).getByText('我已经会了'))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useUserStore.getState().progress[1].status).toBe('mastered')
  expect(screen.getByRole('status').textContent).toContain('已标为已会')
  // reopen → now offers reset
  fireEvent.click(rowButtons()[0])
  fireEvent.click(within(await screen.findByRole('dialog')).getByText('重新学'))
  expect(useUserStore.getState().progress[1].status).toBe('new')
})

test('multi-select: select all in the filter, mark known; PIN gate when set', async () => {
  useUserStore.setState({ parentPin: null, errorBank: [1], progress: {} })
  renderWords()
  fireEvent.change(screen.getByLabelText('搜索单词'), { target: { value: 'ab' } })
  const n = Number(screen.getByText(/^\d+ \/ 1574$/).textContent!.split(' ')[0])
  expect(n).toBeGreaterThan(1)
  fireEvent.click(screen.getByText('多选'))
  fireEvent.click(screen.getByText(`全选 ${n}`))
  expect(screen.getByText(`已选 ${n}`)).toBeTruthy()
  fireEvent.click(screen.getByText('已经会了'))
  const st = useUserStore.getState()
  expect(Object.values(st.progress).filter((p) => p.status === 'mastered').length).toBe(n)
  expect(st.errorBank).toEqual([])
  expect(screen.queryByText(/已选/)).toBeNull()

  // with a PIN, the bulk action waits for the dialog
  useUserStore.setState({ parentPin: '1234' })
  fireEvent.click(screen.getByText('多选'))
  fireEvent.click(rowButtons()[0])
  fireEvent.click(screen.getByText('重新学'))
  const pin = await screen.findByLabelText('家长 PIN')
  expect(Object.values(useUserStore.getState().progress).filter((p) => p.status === 'new').length).toBe(0)
  fireEvent.change(pin, { target: { value: '1234' } })
  expect(Object.values(useUserStore.getState().progress).filter((p) => p.status === 'new').length).toBe(1)
})
