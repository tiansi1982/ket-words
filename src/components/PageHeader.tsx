import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

// Frosted circular back-to-home button shared by all sub-pages
export function BackButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/')}
      aria-label="返回首页"
      className="glass-chip grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-all hover:text-foreground hover:shadow-md active:scale-95"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  )
}

// Quiz-page header: back button + centered counter pill (spacer keeps it centered)
export default function PageHeader({ counter }: { counter: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <BackButton />
      <span className="glass-chip rounded-full px-3.5 py-1.5 text-sm font-semibold text-muted-foreground tabular-nums">
        {counter}
      </span>
      <div className="w-10" />
    </div>
  )
}
