import { Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Small frosted TTS button shared by the study/practice surfaces
export default function SpeakButton({
  onClick,
  label = '朗读单词和例句',
  className,
  iconClassName,
}: {
  onClick: () => void
  label?: string
  className?: string
  iconClassName?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'glass-chip grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary transition-all hover:shadow-md active:scale-95',
        className
      )}
    >
      <Volume2 className={cn('h-4.5 w-4.5', iconClassName)} />
    </button>
  )
}
