import assert from 'node:assert'
const { similarity } = await import('../src/services/speechAssessment')

// Punctuation and case must not count against the score
assert.equal(similarity('I like ice cream.', 'i like ice cream'), 100)
assert.equal(similarity("She doesn't go to school on Sundays.", 'she doesnt go to school on sundays'), 100)
// One wrong word in a short sentence still passes (>= 70)
assert.ok(similarity('I like ice cream.', 'i like my cream') >= 70)
// A totally different sentence fails
assert.ok(similarity('I like ice cream.', 'the weather is bad today') < 70)
// Single word still works as before
assert.equal(similarity('apple', 'Apple'), 100)
assert.ok(similarity('apple', 'people') < 70)
console.log('✅ sentence similarity assertions passed')
