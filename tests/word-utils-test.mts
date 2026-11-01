import assert from 'node:assert'
import { displayWord, difficultyOf } from '../src/lib/word-utils'
import { test } from 'vitest'

test('word-utils-test', async () => {

const { useWordStore, wordsLoaded } = await import('../src/store/wordStore')
await wordsLoaded

// ── displayWord: 去掉空格前置的消歧注释，保留内联可选字母 ──
assert.equal(displayWord('design (DRAWING)'), 'design', 'strips disambiguation note')
assert.equal(displayWord('listen (to)'), 'listen', 'strips particle note')
assert.equal(displayWord('blond(e)'), 'blond(e)', 'keeps inline optional letters')
assert.equal(displayWord('ice cream'), 'ice cream', 'plain phrase unchanged')

// ── difficultyOf: 按基础拼写总字母数分桶（D3：词组不再只看第一个词）──
assert.equal(difficultyOf('cat'), 'easy', '3 letters → easy')
assert.equal(difficultyOf('tree'), 'easy', '4 letters → easy')
assert.equal(difficultyOf('blond(e)'), 'medium', 'base spelling "blond" = 5 letters')
assert.equal(difficultyOf('ice cream'), 'hard', '8 total letters, not 3')
assert.equal(difficultyOf('bus stop'), 'medium', '7 total letters')
assert.equal(difficultyOf('design (DRAWING)'), 'medium', 'note ignored, "design" = 6')
assert.equal(difficultyOf('beautiful'), 'hard', '9 letters → hard')

// ── checkSpelling: 拼写变体 + 同释义同词性的同义词都算对（B3/D2）──
const { checkSpelling, words } = useWordStore.getState()
const byWord = (s: string) => {
  const w = words.find((w) => w.word === s)
  assert.ok(w, `word list has "${s}"`)
  return w!
}
const plane = byWord('plane') // 飞机 n，同义词 aeroplane
assert.ok(checkSpelling('plane', plane), 'own spelling accepted')
assert.ok(checkSpelling('  Plane ', plane), 'case/space insensitive')
assert.ok(checkSpelling('aeroplane', plane), 'synonym with same definition+pos accepted')
assert.ok(!checkSpelling('plan', plane), 'near-miss rejected')
const ad = byWord('ad') // 广告 n，同义词 advert / advertisement
assert.ok(checkSpelling('advertisement', ad), 'three-way synonym group accepted')

console.log('✅ word-utils assertions passed')

// ── findInExample: forms first (irregular inflections), then base + suffix (R5) ──
{
  const { findInExample } = await import('../src/lib/word-utils')
  const hit = (ex: string, w: string, forms?: string[]) => {
    const m = findInExample(ex, w, forms)
    return m ? ex.slice(m.index, m.index + m.length) : null
  }
  assert.equal(hit('He goes to school.', 'go'), 'goes', 'base + suffix')
  assert.equal(hit('We flew to Spain.', 'fly', ['flew', 'flown']), 'flew', 'irregular form from forms')
  assert.equal(hit('Brush your teeth twice a day.', 'tooth', ['teeth']), 'teeth')
  assert.equal(hit('She looks after her brother.', 'look after', ['looks after']), 'looks after', 'phrasal verb inflected')
  assert.equal(hit('She has blonde hair.', 'blond(e)'), 'blonde', 'inline optional letter via suffix')
  assert.equal(hit('A website has pages.', 'site'), null, 'no word boundary → no match')
  assert.equal(hit('A website has pages.', 'site', ['website']), 'website', 'forms can name a derived word')
  assert.equal(hit('Nothing here.', 'cat', ['cats']), null)
  // every dictionary entry is highlightable
  for (const w of words) assert.ok(findInExample(w.example, w.word, w.forms), `#${w.id} ${w.word} highlightable`)
}

console.log('✅ findInExample assertions passed')
})
