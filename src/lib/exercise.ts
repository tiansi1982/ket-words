import { baseWord, difficultyOf, findInExample, matchesSpelling, shuffled, type Difficulty } from '@/lib/word-utils'
import type { Word, WordProgress } from '@/types'

// ── Daily study: which phases a word goes through (F4) ──
export type Phase = 'show' | 'speak' | 'quiz' | 'result'
export type QuizType = 'spell' | 'dictation' | 'gap'

// New and half-learned words are taught first (card → read aloud → spell).
// Due reviews are tested first — recall before re-exposure — then the card
// comes back as the result, then the read-aloud.
export function phasePlan(review: boolean, speech: boolean): Phase[] {
  if (review) return speech ? ['quiz', 'result', 'speak'] : ['quiz', 'result']
  return speech ? ['show', 'speak', 'quiz', 'result'] : ['show', 'quiz', 'result']
}

// The further a review has come, the weaker the cue: a word mastered
// yesterday gets the Chinese prompt, one past its first interval gets
// dictation (hear → spell), one at the 15/30-day reviews fills the gap in
// its example sentence (context only). Gap-fill needs a locatable target.
export const GAP_FROM_SRS_LEVEL = 3
export function quizTypeFor(p: WordProgress | undefined, review: boolean, word?: Word): QuizType {
  if (!review) return 'spell'
  const level = p?.srsLevel ?? 0
  if (level >= GAP_FROM_SRS_LEVEL && word && findInExample(word.example, word.word, word.forms)) return 'gap'
  return level >= 1 ? 'dictation' : 'spell'
}

// Where the target word sits in the example sentence, for gap-fill
export function gapFor(word: Word): { before: string; answer: string; after: string } | null {
  const m = findInExample(word.example, word.word, word.forms)
  if (!m) return null
  return {
    before: word.example.slice(0, m.index),
    answer: word.example.slice(m.index, m.index + m.length),
    after: word.example.slice(m.index + m.length),
  }
}

// Gap-fill accepts the form in the sentence (goes, flew) or the base spelling
export function matchesGap(input: string, word: Word): boolean {
  const n = input.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!n) return false
  const m = findInExample(word.example, word.word, word.forms)
  if (m && word.example.slice(m.index, m.index + m.length).toLowerCase() === n) return true
  return matchesSpelling(input, word.word)
}

// ── Multiple choice distractors ──

// Three other words as options: same part of speech first so distractors
// are plausible; never a synonym (same definition → two right answers) or
// the same spelling under another id
export function buildWordOptions(correct: Word, pool: readonly Word[], n = 3): Word[] {
  const correctBase = baseWord(correct.word).toLowerCase()
  const ok = (w: Word) =>
    w.id !== correct.id && w.definition !== correct.definition && baseWord(w.word).toLowerCase() !== correctBase
  const samePos = shuffled(pool.filter((w) => ok(w) && w.pos === correct.pos))
  const otherPos = shuffled(pool.filter((w) => ok(w) && w.pos !== correct.pos))
  const picked: Word[] = []
  const used = new Set([correctBase])
  for (const w of [...samePos, ...otherPos]) {
    const text = baseWord(w.word).toLowerCase()
    if (used.has(text)) continue
    used.add(text)
    picked.push(w)
    if (picked.length === n) break
  }
  return shuffled([...picked, correct])
}

export interface DefinitionOption {
  wordId: number
  text: string
}

// Three other definitions as options (English → Chinese): same part of
// speech first, never the same definition text twice
export function buildDefinitionOptions(correct: Word, pool: readonly Word[], n = 3): DefinitionOption[] {
  const samePos = shuffled(pool.filter((w) => w.id !== correct.id && w.pos === correct.pos))
  const otherPos = shuffled(pool.filter((w) => w.id !== correct.id && w.pos !== correct.pos))
  const picked: DefinitionOption[] = []
  const used = new Set([correct.definition])
  for (const w of [...samePos, ...otherPos]) {
    if (used.has(w.definition)) continue
    used.add(w.definition)
    picked.push({ wordId: w.id, text: w.definition })
    if (picked.length === n) break
  }
  return shuffled([...picked, { wordId: correct.id, text: correct.definition }])
}

// ── Placement test sampling and estimate (F3) ──
export type DifficultyQuota = Record<Difficulty, number>

export const PLACEMENT_QUOTA: DifficultyQuota = { easy: 16, medium: 14, hard: 10 }

// Random words per difficulty bucket, skipping excluded ids; short buckets
// just yield fewer questions
export function sampleByDifficulty(words: readonly Word[], quota: DifficultyQuota, exclude: ReadonlySet<number> = new Set()): Word[] {
  const buckets: Record<Difficulty, Word[]> = { easy: [], medium: [], hard: [] }
  for (const w of words) if (!exclude.has(w.id)) buckets[difficultyOf(w.word)].push(w)
  const out: Word[] = []
  for (const level of ['easy', 'medium', 'hard'] as const) {
    out.push(...shuffled(buckets[level]).slice(0, quota[level]))
  }
  return shuffled(out)
}

export interface BucketScore {
  correct: number
  total: number
}

// Project the sample's per-bucket accuracy onto the whole dictionary
export function estimateKnown(
  scores: Record<Difficulty, BucketScore>,
  bucketSizes: Record<Difficulty, number>
): number {
  let sum = 0
  for (const level of ['easy', 'medium', 'hard'] as const) {
    const { correct, total } = scores[level]
    if (total > 0) sum += (correct / total) * bucketSizes[level]
  }
  return Math.round(sum)
}

export function bucketSizes(words: readonly Word[]): Record<Difficulty, number> {
  const sizes: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  for (const w of words) sizes[difficultyOf(w.word)]++
  return sizes
}
