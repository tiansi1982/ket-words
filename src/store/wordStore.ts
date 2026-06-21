import { create } from 'zustand'
import type { Word } from '@/types'
import wordData from '@/data/ket-words.json'

const allWords: Word[] = wordData as Word[]

interface WordStore {
  words: Word[]
  getWord: (id: number) => Word | undefined
  // Pick today's study words: first N words not yet mastered
  pickDailyWords: (masteredIds: Set<number>, goal: number) => Word[]
  // Pick words from error bank
  getErrorWords: (errorIds: number[]) => Word[]
}

export const useWordStore = create<WordStore>()(() => ({
  words: allWords,

  getWord: (id) => allWords.find((w) => w.id === id),

  pickDailyWords: (masteredIds, goal) => {
    const baseLen = (word: string) => word.split(' ')[0].length

    const pool = allWords.filter((w) => !masteredIds.has(w.id))
    const shuffle = (arr: Word[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    }

    const easy   = shuffle(pool.filter((w) => baseLen(w.word) <= 4))
    const medium = shuffle(pool.filter((w) => baseLen(w.word) >= 5 && baseLen(w.word) <= 7))
    const hard   = shuffle(pool.filter((w) => baseLen(w.word) >= 8))

    // Progress 0→1 based on how many of all words are mastered
    const p = Math.min(1, masteredIds.size / allWords.length)

    // Weights shift from easy-heavy → hard-heavy as progress grows
    const wEasy   = Math.max(0.10, 0.65 - 0.55 * p)
    const wHard   = Math.min(0.55, 0.05 + 0.50 * p)
    const wMedium = 1 - wEasy - wHard

    // Target counts
    let nEasy   = Math.round(goal * wEasy)
    let nMedium = Math.round(goal * wMedium)
    let nHard   = goal - nEasy - nMedium

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

    return shuffle(
      [...easyPicked, ...mediumPicked, ...hardPicked, ...easyExtra, ...mediumExtra].slice(0, goal)
    )
  },

  getErrorWords: (errorIds) =>
    errorIds
      .map((id) => allWords.find((w) => w.id === id))
      .filter((w): w is Word => w !== undefined),
}))
