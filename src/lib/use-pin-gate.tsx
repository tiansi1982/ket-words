import { useCallback, useState, type ReactNode } from 'react'
import { useUserStore } from '@/store/userStore'
import PinDialog from '@/components/PinDialog'

// guard(action) runs the action at once when no parent PIN is set, otherwise
// after the PIN dialog succeeds. Render `dialog` somewhere in the component.
export function usePinGate(title?: string): { guard: (action: () => void) => void; dialog: ReactNode } {
  const parentPin = useUserStore((s) => s.parentPin)
  const [pending, setPending] = useState<(() => void) | null>(null)

  const guard = useCallback(
    (action: () => void) => {
      if (!parentPin) action()
      else setPending(() => action)
    },
    [parentPin]
  )

  const close = useCallback(() => setPending(null), [])
  const succeed = useCallback(() => {
    const action = pending
    setPending(null)
    action?.()
  }, [pending])

  const dialog = <PinDialog open={pending !== null} title={title} onSuccess={succeed} onClose={close} />
  return { guard, dialog }
}
