import { useState, type ReactNode, type Ref } from 'react'
import { cn } from '@/lib/utils'

// Fixed-row-height windowed list: only rows near the viewport are in the
// DOM, so the full 1574-word list stays light on low-end tablets. The
// viewport is taken as window.innerHeight (the list fills the screen) with
// generous overscan, which keeps this free of layout effects.
export default function VirtualList<T>({
  items,
  rowHeight,
  keyOf,
  renderRow,
  className,
  ref,
  overscan = 8,
}: {
  items: readonly T[]
  rowHeight: number
  keyOf: (item: T) => string | number
  renderRow: (item: T, index: number) => ReactNode
  className?: string
  ref?: Ref<HTMLDivElement>
  overscan?: number
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const viewport = typeof window !== 'undefined' ? window.innerHeight : 800
  const total = items.length * rowHeight
  // A filter change can shrink the list below the remembered scroll position
  const top = Math.min(scrollTop, Math.max(0, total - viewport))
  const start = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const end = Math.min(items.length, Math.ceil((top + viewport) / rowHeight) + overscan)

  return (
    <div
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={cn('overflow-y-auto overscroll-contain', className)}
    >
      <div style={{ height: total, position: 'relative' }}>
        {items.slice(start, end).map((item, i) => (
          <div
            key={keyOf(item)}
            style={{ position: 'absolute', top: (start + i) * rowHeight, left: 0, right: 0, height: rowHeight }}
          >
            {renderRow(item, start + i)}
          </div>
        ))}
      </div>
    </div>
  )
}
