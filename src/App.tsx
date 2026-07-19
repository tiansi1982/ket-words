import { lazy, Suspense, Component, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { useWordStore } from '@/store/wordStore'
import { startAutoSync } from '@/services/sync'
import { Button } from '@/components/ui/button'

const Home = lazy(() => import('@/pages/Home'))
const Study = lazy(() => import('@/pages/Study'))
const ErrorBank = lazy(() => import('@/pages/ErrorBank'))
const Stats = lazy(() => import('@/pages/Stats'))
const Practice = lazy(() => import('@/pages/Practice'))

function Centered({ children }: { children: ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-4">{children}</div>
}

function NotFound() {
  return (
    <Centered>
      <div className="text-6xl animate-drift">🤔</div>
      <p className="text-muted-foreground font-medium">页面不存在</p>
      <Link to="/">
        <Button variant="hero" className="h-11 px-7">返回首页</Button>
      </Link>
    </Centered>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <Centered>
          <div className="text-6xl animate-drift">😵</div>
          <p className="text-muted-foreground font-medium">出了点问题，刷新一下试试</p>
          <Button
            variant="hero"
            className="h-11 px-7"
            onClick={() => window.location.assign('/')}
          >
            回到首页
          </Button>
        </Centered>
      )
    }
    return this.props.children
  }
}

const loading = (
  <Centered>
    <div className="flex flex-col items-center gap-4">
      <div className="h-12 w-12 rounded-2xl bg-brand-gradient animate-pop-in shadow-lg shadow-primary/30" />
      <p className="text-muted-foreground text-sm font-medium animate-pulse tracking-wide">加载中...</p>
    </div>
  </Centered>
)

export default function App() {
  // Wait for the word-list chunk so pages never see an empty dictionary
  const ready = useWordStore((s) => s.ready)

  // P3: pull bound profiles once, then keep local changes pushed (no-op if
  // VITE_LC_* is not configured)
  useEffect(() => {
    startAutoSync()
  }, [])

  if (!ready) return loading

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={loading}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/study" element={<Study />} />
            <Route path="/error-bank" element={<ErrorBank />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
