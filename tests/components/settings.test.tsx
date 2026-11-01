// @vitest-environment jsdom
// Settings page (R10): parent PIN gates the pass mark; PIN set-up validation.
import { test, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Settings from '@/pages/Settings'
import { useUserStore } from '@/store/userStore'

afterEach(cleanup)

const renderSettings = () =>
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  )

test('with a PIN set, the pass mark unlocks only after the right PIN', async () => {
  useUserStore.setState({ parentPin: '1234', settings: { passScore: 80 } })
  renderSettings()
  const slider = screen.getByLabelText('跟读通过线') as HTMLInputElement
  expect(slider.disabled).toBe(true)
  expect(screen.getByText('80 分')).toBeTruthy()

  fireEvent.click(screen.getByText('解锁修改'))
  const pin = await screen.findByLabelText('家长 PIN')
  fireEvent.change(pin, { target: { value: '9999' } })
  expect(screen.getByText('PIN 不对，再试一次')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('家长 PIN'), { target: { value: '1234' } })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect((screen.getByLabelText('跟读通过线') as HTMLInputElement).disabled).toBe(false)

  fireEvent.change(screen.getByLabelText('跟读通过线'), { target: { value: '70' } })
  expect(useUserStore.getState().settings!.passScore).toBe(70)
  expect(screen.getByText('70 分')).toBeTruthy()

  fireEvent.click(screen.getByLabelText('自动朗读'))
  expect(useUserStore.getState().settings!.autoSpeak).toBe(false)
})

test('setting a PIN validates length and confirmation', () => {
  useUserStore.setState({ parentPin: null, settings: {} })
  renderSettings()
  expect((screen.getByLabelText('跟读通过线') as HTMLInputElement).disabled).toBe(false)
  fireEvent.click(screen.getByText('设置家长 PIN'))
  fireEvent.change(screen.getByLabelText('新 PIN'), { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText('再输一次新 PIN'), { target: { value: '12' } })
  fireEvent.click(screen.getByText('保存'))
  expect(screen.getByText('PIN 必须是 4 位数字')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('新 PIN'), { target: { value: '4321' } })
  fireEvent.change(screen.getByLabelText('再输一次新 PIN'), { target: { value: '4322' } })
  fireEvent.click(screen.getByText('保存'))
  expect(screen.getByText('两次输入的不一样')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('再输一次新 PIN'), { target: { value: '4321' } })
  fireEvent.click(screen.getByText('保存'))
  expect(useUserStore.getState().parentPin).toBe('4321')
  expect(screen.getByText('修改 PIN')).toBeTruthy()
})
