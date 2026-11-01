import type { ProfileData, WordProgress } from '@/types'
import { pruneSessionWords } from '@/lib/session'

// Ids removed from src/data/ket-words.json as exact duplicates (the G section
// had been imported twice, ids 572–600 vs 601–645), mapped to the surviving
// entry. Ids are never renumbered — user data is keyed by them — so progress,
// error-bank entries and sessions saved under an old id are folded into the
// kept id here (persist migration v3, and on every sync merge for snapshots
// written by older clients).
export const WORD_ALIASES: Readonly<Record<number, number>> = {
  601: 572, // goat
  602: 573, // gold
  605: 574, // good
  611: 575, // goodbye
  612: 577, // grade
  615: 579, // grandchild
  616: 580, // granddaughter
  617: 581, // grandfather
  618: 582, // grandma
  619: 583, // grandmother
  620: 584, // grandpa
  622: 586, // grandson
  626: 587, // great
  628: 589, // grey
  630: 590, // grocery store
  631: 591, // ground
  632: 592, // group
  633: 593, // grow
  634: 594, // grow up
  635: 595, // guess
  641: 596, // guitar
  643: 597, // gym
  644: 598, // hair
  645: 600, // half
}

export function canonicalWordId(id: number): number {
  return WORD_ALIASES[id] ?? id
}

const STATUS_RANK = { new: 0, learning: 1, mastered: 2 } as const

// Two records for the same word (one per duplicate id): keep the one proving
// more knowledge, and between equals the one studied more recently
function pickProgress(a: WordProgress, b: WordProgress): WordProgress {
  const ra = STATUS_RANK[a.status] ?? 0
  const rb = STATUS_RANK[b.status] ?? 0
  if (ra !== rb) return ra > rb ? a : b
  return (b.lastStudied ?? 0) > (a.lastStudied ?? 0) ? b : a
}

// Fold aliased ids into their canonical id. Returns the same object when the
// data has no aliased ids, so callers can compare by identity.
export function remapProfileData(data: ProfileData): ProfileData {
  let touched = false

  const progress: Record<number, WordProgress> = {}
  for (const [key, p] of Object.entries(data.progress ?? {})) {
    const oldId = Number(key)
    const id = canonicalWordId(oldId)
    if (id !== oldId) touched = true
    const rec = p.wordId === id ? p : { ...p, wordId: id }
    progress[id] = progress[id] ? pickProgress(progress[id], rec) : rec
  }

  const errorBank: number[] = []
  for (const oldId of data.errorBank ?? []) {
    const id = canonicalWordId(oldId)
    if (id !== oldId) touched = true
    if (!errorBank.includes(id)) errorBank.push(id)
  }
  if (errorBank.length !== (data.errorBank ?? []).length) touched = true

  let currentSession = data.currentSession ?? null
  if (currentSession && currentSession.wordIds.some((id) => id in WORD_ALIASES)) {
    touched = true
    currentSession = pruneSessionWords(
      { ...currentSession, wordIds: currentSession.wordIds.map(canonicalWordId) },
      () => true
    )
  }

  if (!touched) return data
  return { ...data, progress, errorBank, currentSession }
}
