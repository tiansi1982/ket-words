import { lazy, Suspense, Component, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { useWordStore } from '@/store/wordStore'
import { Button } from '@/components/ui/button'

const Home = lazy(() => import('@/pages/Home'))
const Study = lazy(() => import('@/pages/Study'))
const ErrorBank = lazy(() => import('@/pages/ErrorBank'))
const Stats = lazy(() => import('@/pages/Stats'))
const Practice = lazy(() => import('@/pages/Practice'))

function Centered({ children }: { children: ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">{children}</div>
}

function NotFound() {
  return (
    <Centered>
      <div className="text-5xl">🤔</div>
      <p className="text-muted-foreground">页面不存在</p>
      <Link to="/"><Button className="rounded-2xl">返回首页</Button></Link>
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
          <div className="text-5xl">😵</div>
          <p className="text-muted-foreground">出了点问题，刷新一下试试</p>
          <Button className="rounded-2xl" onClick={() => window.location.assign('/')}>
            回到首页
          </Button>
        </Centered>
      )
    }
    return this.props.children
  }
}

const loading = <Centered><p className="text-muted-foreground animate-pulse">加载中...</p></Centered>

export default function App() {
  // Wait for the word-list chunk so pages never see an empty dictionary
  const ready = useWordStore((s) => s.ready)
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
