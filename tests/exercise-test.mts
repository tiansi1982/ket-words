// F3/F4 helpers: phase plans, quiz type, distractors, placement sampling and estimate
import assert from 'node:assert'
import { test } from 'vitest'
import type { Word } from '../src/types'

test('exercise-test', async () => {
  const { phasePlan, quizTypeFor, buildWordOptions, buildDefinitionOptions, sampleByDifficulty, estimateKnown, bucketSizes } =
    await import('../src/lib/exercise')
  const { difficultyOf } = await import('../src/lib/word-utils')
  const { useWordStore, wordsLoaded } = await import('../src/store/wordStore')
  await wordsLoaded
  const words = useWordStore.getState().words

  // ── phase plans: teach new words, test reviews first ──
  assert.deepEqual(phasePlan(false, true), ['show', 'speak', 'quiz', 'result'])
  assert.deepEqual(phasePlan(false, false), ['show', 'quiz', 'result'])
  assert.deepEqual(phasePlan(true, true), ['quiz', 'result', 'speak'])
  assert.deepEqual(phasePlan(true, false), ['quiz', 'result'])

  // ── quiz type: dictation only for reviews past their first interval ──
  const p = (srsLevel: number) => ({ wordId: 1, status: 'mastered' as const, correctCount: 3, wrongCount: 0, lastStudied: 0, srsLevel })
  assert.equal(quizTypeFor(undefined, false), 'spell')
  assert.equal(quizTypeFor(p(3), false), 'spell', 'not a review → spell')
  assert.equal(quizTypeFor(p(0), true), 'spell', 'mastered yesterday → Chinese prompt')
  assert.equal(quizTypeFor(p(1), true), 'dictation')
  assert.equal(quizTypeFor(p(4), true), 'dictation')

  // ── word options: 4 unique spellings, correct included, same pos preferred, no synonyms ──
  const plane = words.find((w) => w.word === 'plane')!
  for (let i = 0; i < 20; i++) {
    const opts = buildWordOptions(plane, words)
    assert.equal(opts.length, 4)
    assert.ok(opts.some((o) => o.id === plane.id))
    assert.equal(new Set(opts.map((o) => o.word.toLowerCase())).size, 4)
    assert.ok(!opts.some((o) => o.id !== plane.id && o.definition === plane.definition), 'no synonym (aeroplane) among distractors')
    assert.ok(opts.filter((o) => o.id !== plane.id).every((o) => o.pos === 'n'), 'nouns only while the bucket is deep')
  }

  // ── definition options: 4 unique texts, correct included ──
  for (let i = 0; i < 20; i++) {
    const opts = buildDefinitionOptions(plane, words)
    assert.equal(opts.length, 4)
    assert.ok(opts.some((o) => o.wordId === plane.id && o.text === plane.definition))
    assert.equal(new Set(opts.map((o) => o.text)).size, 4, 'no duplicate definition text')
  }

  // ── stratified sample ──
  const quota = { easy: 16, medium: 14, hard: 10 }
  const sample = sampleByDifficulty(words, quota)
  assert.equal(sample.length, 40)
  const count = (ws: Word[], d: string) => ws.filter((w) => difficultyOf(w.word) === d).length
  assert.equal(count(sample, 'easy'), 16)
  assert.equal(count(sample, 'medium'), 14)
  assert.equal(count(sample, 'hard'), 10)
  assert.equal(new Set(sample.map((w) => w.id)).size, 40, 'no repeats')
  const excluded = new Set(words.filter((w) => difficultyOf(w.word) === 'hard').map((w) => w.id))
  const noHard = sampleByDifficulty(words, quota, excluded)
  assert.equal(count(noHard, 'hard'), 0, 'excluded ids never sampled')
  assert.equal(noHard.length, 30, 'a short bucket yields fewer questions')
  // two draws differ (shuffled)
  assert.notDeepEqual(sampleByDifficulty(words, quota).map((w) => w.id), sample.map((w) => w.id))

  // ── estimate projects bucket accuracy onto the dictionary ──
  const sizes = bucketSizes(words)
  assert.deepEqual(sizes, { easy: 478, medium: 750, hard: 346 })
  assert.equal(estimateKnown({ easy: { correct: 16, total: 16 }, medium: { correct: 7, total: 14 }, hard: { correct: 0, total: 10 } }, sizes), 478 + 375)
  assert.equal(estimateKnown({ easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } }, sizes), 0, 'empty buckets contribute nothing')

  console.log('✅ exercise assertions passed')
})
