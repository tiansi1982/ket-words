import assert from 'node:assert'
import { displayWord, difficultyOf } from '../src/lib/word-utils'

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

console.log('✅ word-utils assertions passed')
