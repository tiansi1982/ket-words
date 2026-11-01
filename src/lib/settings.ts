import type { ProfileSettings } from '@/types'

// Per-profile preferences (R10). Storage only keeps what the parent changed;
// everything else falls back to these defaults, so a later default change
// reaches profiles that never touched the setting.
export const DEFAULT_SETTINGS: ProfileSettings = {
  passScore: 90,
  autoSpeak: true,
}

export const PASS_SCORE_MIN = 60
export const PASS_SCORE_MAX = 100
export const PASS_SCORE_STEP = 5

export function resolveSettings(raw?: Partial<ProfileSettings> | null): ProfileSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) }
  const score = Number(merged.passScore)
  merged.passScore = Number.isFinite(score)
    ? Math.min(PASS_SCORE_MAX, Math.max(PASS_SCORE_MIN, Math.round(score)))
    : DEFAULT_SETTINGS.passScore
  merged.autoSpeak = merged.autoSpeak !== false
  return merged
}

// Parent PIN: exactly four digits. It is a tap-proofing measure, not security.
export const PIN_LENGTH = 4
export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}
