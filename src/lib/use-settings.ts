import { useMemo } from 'react'
import { useUserStore } from '@/store/userStore'
import { resolveSettings } from '@/lib/settings'
import type { ProfileSettings } from '@/types'

// The active profile's settings with defaults applied (stable object per store change)
export function useSettings(): ProfileSettings {
  const raw = useUserStore((s) => s.settings)
  return useMemo(() => resolveSettings(raw), [raw])
}
