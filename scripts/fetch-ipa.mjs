// Fetch British IPA for every word in ket-words.json from dictionaryapi.dev.
// Incremental: results cached in scripts/ipa-cache.json, rerun resumes.
// Usage: node scripts/fetch-ipa.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const words = JSON.parse(readFileSync(join(root, 'src/data/ket-words.json'), 'utf8'))
const cachePath = join(root, 'scripts/ipa-cache.json')
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}

// Same base-word logic as src/lib/word-utils.ts
const baseWord = (w) => w.replace(/ \([^)]*\)/g, '').trim().replace(/\(([^)]*)\)/g, '')

// Prefer the UK audio entry's transcription, then the top-level phonetic
function pickIpa(entries) {
  for (const entry of entries) {
    const phonetics = entry.phonetics ?? []
    const uk = phonetics.find((p) => p.text && /-uk\.\w+$/.test(p.audio ?? ''))
    if (uk) return uk.text
  }
  for (const entry of entries) {
    if (entry.phonetic) return entry.phonetic
    const any = (entry.phonetics ?? []).find((p) => p.text)
    if (any) return any.text
  }
  return null
}

async function fetchIpa(base) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(base)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 404) return null
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return pickIpa(await res.json())
    } catch (e) {
      if (attempt === 2) {
        console.error(`FAIL ${base}: ${e.message}`)
        return undefined // transient failure — do not cache, retry on next run
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

const bases = [...new Set(words.map((w) => baseWord(w.word)))]
const todo = bases.filter((b) => !(b in cache))
console.log(`${bases.length} unique words, ${todo.length} to fetch`)

let fetched = 0
const CONCURRENCY = 4
const queue = [...todo]
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const base = queue.shift()
      const ipa = await fetchIpa(base)
      if (ipa !== undefined) cache[base] = ipa
      fetched++
      if (fetched % 50 === 0) {
        writeFileSync(cachePath, JSON.stringify(cache, null, 1))
        console.log(`${fetched}/${todo.length}`)
      }
      await new Promise((r) => setTimeout(r, 150))
    }
  })
)
writeFileSync(cachePath, JSON.stringify(cache, null, 1))

const withIpa = bases.filter((b) => cache[b]).length
console.log(`done: ${withIpa}/${bases.length} words have IPA`)
