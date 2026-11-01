import { useEffect, useState } from 'react'
import { useUserStore } from '@/store/userStore'
import { PIN_LENGTH } from '@/lib/settings'
import { Lock, X } from 'lucide-react'

// Asks for the parent PIN before a guarded action runs (R10). The caller
// decides when to open it; usePinGate() wraps the common case.
interface PinDialogProps {
  open: boolean
  title?: string
  onSuccess: () => void
  onClose: () => void
}

// Mounted only while open, so each opening starts with a blank field
export default function PinDialog(props: PinDialogProps) {
  return props.open ? <PinDialogBody {...props} /> : null
}

function PinDialogBody({ title = '请家长输入 PIN', onSuccess, onClose }: PinDialogProps) {
  const parentPin = useUserStore((s) => s.parentPin)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, PIN_LENGTH)
    setValue(digits)
    setError(false)
    if (digits.length === PIN_LENGTH) {
      if (digits === parentPin) {
        onSuccess()
      } else {
        setError(true)
        setValue('')
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-6 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-title"
        className="glass-card w-full max-w-xs rounded-[1.75rem] p-6 text-center animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="icon-tile h-9 w-9 rounded-xl bg-brand-gradient">
            <Lock className="h-4 w-4" />
          </span>
          <button onClick={onClose} aria-label="关闭" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 id="pin-title" className="text-base font-bold">{title}</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          aria-label="家长 PIN"
          type="password"
          className={`glass-card mt-4 h-14 w-full rounded-2xl text-center font-mono text-3xl tracking-[0.6em] outline-none focus:ring-3 focus:ring-primary/40 ${
            error ? 'ring-3 ring-destructive/40' : ''
          }`}
        />
        <p className={`mt-2 h-4 text-xs ${error ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
          {error ? 'PIN 不对，再试一次' : `${PIN_LENGTH} 位数字`}
        </p>
      </div>
    </div>
  )
}
