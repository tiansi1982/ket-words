// Remove unknown ids from a session (daily or error-bank round), keeping the
// cursor on the same word: the new index is the number of surviving ids
// before the old index. Duplicates collapse too. Returns the same object when
// nothing changed so callers can skip a set().
export function pruneSessionWords<T extends { wordIds: number[]; currentIndex?: number }>(
  session: T,
  isKnown: (wordId: number) => boolean
): T {
  const seen = new Set<number>()
  const keep = (id: number) => {
    if (!isKnown(id) || seen.has(id)) return false
    seen.add(id)
    return true
  }
  const oldIndex = session.currentIndex ?? 0
  const wordIds = session.wordIds.filter(keep)
  if (wordIds.length === session.wordIds.length) return session
  seen.clear()
  const currentIndex = session.wordIds.slice(0, oldIndex).filter(keep).length
  return { ...session, wordIds, currentIndex }
}
