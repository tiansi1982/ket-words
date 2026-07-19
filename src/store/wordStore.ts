import { create } from 'zustand'
import type { Word } from '@/types'
import { difficultyOf, matchesSpelling, shuffled as shuffle } from '@/lib/word-utils'

// The word list (350KB+) loads as its own chunk so the app shell parses first;
// App gates rendering on `ready`
let allWords: Word[] = []
let wordById = new Map<number, Word>()

interface WordStore {
  ready: boolean
  words: Word[]
  getWord: (id: number) => Word | undefined
  // Pick today's study words: words already being learned first, then new
  // words by difficulty weights (due SRS reviews claim slots before this)
  pickDailyWords: (masteredIds: Set<number>, goal: number, learningIds: Set<number>) => Word[]
  // Pick words from error bank
  getErrorWords: (errorIds: number[]) => Word[]
  // Spelling check: accepts the target word's spelling variants,
  // plus any synonym sharing the same definition and pos (the prompt can't distinguish them)
  checkSpelling: (input: string, target: Word) => boolean
}

export const useWordStore = create<WordStore>()(() => ({
  ready: false,
  words: [],

  getWord: (id) => wordById.get(id),

  checkSpelling: (input, target) => {
    if (matchesSpelling(input, target.word)) return true
    return allWords.some(
      (w) =>
        w.id !== target.id &&
        w.definition === target.definition &&
        w.pos === target.pos &&
        matchesSpelling(input, w.word)
    )
  },

  pickDailyWords: (masteredIds, goal, learningIds) => {
    // Words already in progress come first so they don't dangle half-learned
    const learningPicked = shuffle(allWords.filter((w) => learningIds.has(w.id))).slice(0, goal)
    goal -= learningPicked.length

    const pool = allWords.filter((w) => !masteredIds.has(w.id) && !learningIds.has(w.id))

    const easy   = shuffle(pool.filter((w) => difficultyOf(w.word) === 'easy'))
    const medium = shuffle(pool.filter((w) => difficultyOf(w.word) === 'medium'))
    const hard   = shuffle(pool.filter((w) => difficultyOf(w.word) === 'hard'))

    // Progress 0→1 based on how many of all words are mastered
    const p = Math.min(1, masteredIds.size / allWords.length)

    // Weights shift from easy-heavy → hard-heavy as progress grows
    const wEasy   = Math.max(0.10, 0.65 - 0.55 * p)
    const wHard   = Math.min(0.55, 0.05 + 0.50 * p)
    const wMedium = 1 - wEasy - wHard

    // Target counts
    const nEasy   = Math.round(goal * wEasy)
    const nMedium = Math.round(goal * wMedium)
    const nHard   = goal - nEasy - nMedium

    // Redistribute if a bucket is exhausted
    const take = (bucket: Word[], n: number): [Word[], number] => {
      const taken = bucket.slice(0, Math.max(0, n))
      return [taken, n - taken.length]
    }
    const [easyPicked,   easyShort]   = take(easy,   nEasy)
    const [mediumPicked, mediumShort] = take(medium, nMedium + easyShort)
    const [hardPicked,   hardShort]   = take(hard,   nHard + mediumShort)
    // Fill any remaining deficit back from easier buckets
    const leftover = hardShort
    const easyExtra   = easy.slice(easyPicked.length, easyPicked.length + leftover)
    const mediumExtra = medium.slice(mediumPicked.length,
      mediumPicked.length + Math.max(0, leftover - easyExtra.length))

    return shuffle([
      ...learningPicked,
      ...[...easyPicked, ...mediumPicked, ...hardPicked, ...easyExtra, ...mediumExtra].slice(0, goal),
    ])
  },

  getErrorWords: (errorIds) =>
    errorIds
      .map((id) => wordById.get(id))
      .filter((w): w is Word => w !== undefined),
}))

export const wordsLoaded = import('@/data/ket-words.json').then((m) => {
  allWords = m.default as Word[]
  wordById = new Map(allWords.map((w) => [w.id, w]))
  useWordStore.setState({ words: allWords, ready: true })
})
