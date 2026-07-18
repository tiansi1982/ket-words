import { cn } from '@/lib/utils'

// Track + fill progress bar. Height/margins go in className; a barClassName
// replaces the default brand-gradient fill (and may override the duration).
export default function ProgressBar({
  value,
  className,
  barClassName,
}: {
  value: number
  className?: string
  barClassName?: string
}) {
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', barClassName ?? 'progress-gradient')}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}
