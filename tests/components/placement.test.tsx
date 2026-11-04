// @vitest-environment jsdom
// Placement test (F3): intro → stratified questions → marks known + estimate
import { test, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Placement from '@/pages/Placement'
import { useUserStore } from '@/store/userStore'
import { useWordStore, wordsLoaded } from '@/store/wordStore'
import { displayWord } from '@/lib/word-utils'

vi.mock('@/services/tts', () => ({
  tts: { speak: vi.fn(), speakAll: vi.fn(), stop: vi.fn(), isSupported: () => true },
}))

beforeAll(() => wordsLoaded)
afterEach(cleanup)

const options = () => screen.getAllByRole('button').filter((b) => b.className.includes('rounded-2xl border p-4'))

test('three-question placement: two right, one wrong', async () => {
  useUserStore.setState({ progress: {}, errorBank: [], placement: null, dailyLog: {} })
  const { words } = useWordStore.getState()
  render(
    <MemoryRouter>
      <Placement quota={{ easy: 1, medium: 1, hard: 1 }} />
    </MemoryRouter>
  )
  expect(screen.getByText('摸底测试')).toBeTruthy()
  fireEvent.click(screen.getByText('开始测试'))
  await screen.findByText('摸底 1 / 3')

  // q1 / q3 show the word → pick its meaning (right, then wrong on purpose);
  // q2 is audio-only → take a guess and read the outcome from the green option
  const answered: { ids: number[]; correct: boolean }[] = []
  for (let q = 0; q < 3; q++) {
    const opts = options()
    expect(opts.length).toBe(4)
    const prompt = document.querySelector('.text-3xl')?.textContent ?? ''
    let target: HTMLElement
    if (q % 2 === 0) {
      const word = words.find((w) => displayWord(w.word) === prompt && opts.some((b) => b.textContent === w.definition))!
      const right = opts.find((b) => b.textContent === word.definition)!
      target = q === 0 ? right : opts.find((b) => b !== right)!
    } else {
      target = opts[0]
    }
    fireEvent.click(target)
    const green = opts.find((b) => b.className.includes('green'))!
    const correct = green === target
    const ids = (q % 2 === 0
      ? words.filter((w) => displayWord(w.word) === prompt && w.definition === green.textContent)
      : words.filter((w) => displayWord(w.word) === green.textContent)
    ).map((w) => w.id)
    expect(ids.length).toBeGreaterThan(0)
    answered.push({ ids, correct })
    expect(screen.getByText(correct ? '✅ 认识！' : /还不认识没关系/)).toBeTruthy()
    fireEvent.click(screen.getByText(q < 2 ? '下一题 →' : '看结果 🎯'))
  }
  const nRight = answered.filter((a) => a.correct).length
  expect(nRight).toBeGreaterThanOrEqual(1)
  expect(nRight).toBeLessThanOrEqual(2)

  await screen.findByText('测完了！')
  expect(screen.getByText(`3 题答对 ${nRight} 题`)).toBeTruthy()
  const st = useUserStore.getState()
  for (const a of answered) {
    if (a.correct) expect(a.ids.some((id) => st.progress[id]?.status === 'mastered')).toBe(true)
    else expect(a.ids.every((id) => st.progress[id] === undefined)).toBe(true)
  }
  expect(st.placement!.correct).toBe(nRight)
  expect(st.placement!.total).toBe(3)
  expect(st.placement!.estimated).toBeGreaterThanOrEqual(nRight)
  expect(st.errorBank).toEqual([])
  expect(st.dailyLog).toEqual({})
})
