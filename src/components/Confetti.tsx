import { useMemo } from 'react'

const COLORS = ['#7c3aed', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#ef4444']

// A short burst of falling paper for the session summary (F8). Pure CSS;
// prefers-reduced-motion collapses the animation globally.
export default function Confetti({ pieces = 28 }: { pieces?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 7) * 0.12}s`,
        duration: `${2.2 + (i % 5) * 0.35}s`,
        color: COLORS[i % COLORS.length],
        rotate: `${(i * 53) % 360}deg`,
      })),
    [pieces]
  )
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {items.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration, background: p.color, transform: `rotate(${p.rotate})` }}
        />
      ))}
    </div>
  )
}
