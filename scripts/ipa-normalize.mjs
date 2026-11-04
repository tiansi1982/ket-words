#!/usr/bin/env node
// F11：把词库里口音混杂的音标统一成剑桥词典风格的英音。
//
//   1. 机械规则：去掉可选的 (ɹ)、保留其它可选段的内容、去连音符、美音的 ɹ/ɚ/ɝ/oʊ/ɾ/ɫ、
//      非卷舌化（词尾与辅音前的 r 并入元音）、ɛ → e、澳音的 a/aː/əː、音节性辅音 l̩ → əl、
//      BATH 词 æ → ɑː 等
//   2. scripts/ipa-overrides.json 里的手写条目优先（键是基础拼写，小写）
//   3. 仍缺音标的词组用各部分的音标拼接（空格分隔）
//   4. 处理后仍含有不在允许符号集里的字符 → 不写入，打印到"待手写"清单
//
// 用法：node scripts/ipa-normalize.mjs [--write]   不带 --write 只打印统计与待手写清单
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORDS = path.join(root, 'src/data/ket-words.json')
const OVERRIDES = path.join(root, 'scripts/ipa-overrides.json')
const write = process.argv.includes('--write')

const words = JSON.parse(readFileSync(WORDS, 'utf8'))
const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, 'utf8')) : {}

const baseWord = (w) => w.replace(/ \([^)]*\)/g, '').trim().replace(/\(([^)]*)\)/g, '')

// 剑桥英音符号集（与 validate-words 保持一致）
export const ALLOWED = new Set([...'pbtdkɡfvθðszʃʒhmnŋlrwjɪeæʌɒʊəiuɑɔɜaːˈˌ. '])

// 英音里读 /ɑː/ 的 BATH 词（KET 范围内）
const BATH = new Set(('after afternoon answer ask aunt bath bathroom basket basketball cant castle chance class classroom ' +
  'dance dancer dancing example fast father glass glasses grass half last laugh pass passport past path plant task ' +
  'branch advance advanced banana giraffe graph photograph staff vast master nasty plaster rather pyjamas ' +
  'disaster command demand grant plant').split(/\s+/))

const VOWEL = 'aeiouæɑɒɔʊʌəɜɪɛ'

export function normalizeIpa(raw, base) {
  let s = raw.trim().replace(/^\/|\/$/g, '').replace(/^\[|\]$/g, '')
  s = s
    .replace(/\((?:ɹ|r)\)/g, '') // optional r (non-rhotic → gone)
    .replace(/\(ː\)/g, 'ː') // optional length → long
    .replace(/\(([^)]*)\)/g, '$1') // other optional segments (schwa, t, w…) → kept: dropping them leaves vowel-less syllables
    .replace(/[͡‿]/g, '') // tie bars
    .replace(/g/g, 'ɡ')
    .replace(/ɹ/g, 'r')
    .replace(/ɾ/g, 't')
    .replace(/ʔ/g, 't')
    .replace(/ɫ/g, 'l')
    .replace(/ʍ/g, 'w')
    .replace(/ɚ/g, 'ər')
    .replace(/ɝ/g, 'ɜːr')
    .replace(/oʊ/g, 'əʊ')
    .replace(/oː/g, 'ɔː')
    .replace(/ʊə̯|ʊə/g, 'ʊə')
    .replace(/([lnm])̩/g, 'ə$1') // syllabic consonant
    .replace(/̯/g, '') // non-syllabic mark
    .replace(/ɛ/g, 'e')
    .replace(/aː/g, 'ɑː') // Australian-style long a
    .replace(/a(?![ɪʊ])/g, 'æ') // bare a (Australian TRAP) → æ; aɪ/aʊ stay
    .replace(/ɜ(?!ː)/g, 'ɜː') // NURSE is always long
    .replace(/əː/g, 'ɜː') // Australian-style NURSE
    .replace(/ʊː/g, 'uː')
    .replace(/ɪː/g, 'iː')
  // non-rhotic: r before a consonant or at the end merges into the vowel
  // a syllable dot or stress mark may sit between the r and the next vowel
  const coda = (v, r) => s.replace(new RegExp(`${v}r(?![.ˈˌ]*[${VOWEL}])`, 'g'), r)
  s = coda('ɑː?', 'ɑː')
  s = coda('ɔː?', 'ɔː')
  s = coda('ɜː?', 'ɜː')
  s = coda('ɪə?', 'ɪə')
  s = coda('eə?', 'eə')
  s = coda('ʊə?', 'ʊə')
  s = coda('aɪə?', 'aɪə')
  s = coda('aʊə?', 'aʊə')
  s = coda('eɪ', 'eə')
  s = coda('ə', 'ə')
  s = s.replace(/ɔ(?![ːɪ])/g, 'ɒ') // short ɔ (US lot/cloth) → ɒ
  s = s.replace(/ɔr(?=[.ˈˌ]*[aeiouæɑɒɔʊʌəɜɪ])/g, 'ɒr')
  if (BATH.has(base.toLowerCase().replace(/'/g, ''))) s = s.replace(/æ/g, 'ɑː')
  s = s.replace(/ːː+/g, 'ː').replace(/\.\./g, '.').replace(/^\./, '').replace(/\.$/, '')
  return `/${s}/`
}

export function isAllowed(ipa) {
  return [...ipa.replace(/^\/|\/$/g, '')].every((ch) => ALLOWED.has(ch))
}

const byBase = new Map()
const review = []
let fromOverride = 0, normalized = 0, composed = 0, missing = 0

// pass 1: single words and phrases with their own IPA
for (const w of words) {
  const base = baseWord(w.word)
  const key = base.toLowerCase()
  let ipa
  if (overrides[key]) {
    ipa = overrides[key]
    fromOverride++
  } else if (w.ipa) {
    ipa = normalizeIpa(w.ipa, base)
    if (!isAllowed(ipa) || /ɑ(?!ː)/.test(ipa)) {
      review.push(`${base}\t${w.ipa}\t${ipa}`)
      ipa = undefined
    } else normalized++
  }
  if (ipa) byBase.set(key, ipa)
  w._ipa = ipa
}
// pass 2: phrases composed from parts
for (const w of words) {
  if (w._ipa) continue
  const base = baseWord(w.word)
  if (!base.includes(' ')) continue
  const parts = base.toLowerCase().replace(/[!?.,]/g, '').split(/\s+/)
  if (parts.every((p) => byBase.has(p))) {
    w._ipa = `/${parts.map((p) => byBase.get(p).replace(/^\/|\/$/g, '')).join(' ')}/`
    composed++
  }
}
const stillMissing = words.filter((w) => !w._ipa).map((w) => baseWord(w.word))
missing = stillMissing.length

console.log(`overrides ${fromOverride} · normalized ${normalized} · composed phrases ${composed} · review ${review.length} · missing ${missing}`)
if (review.length) {
  console.log('\n── 待手写（原值 → 规则化后仍不合格）──')
  for (const r of review) console.log(r)
}
if (stillMissing.length) {
  console.log('\n── 仍缺音标 ──')
  console.log(stillMissing.join(', '))
}

if (write) {
  for (const w of words) {
    if (w._ipa) w.ipa = w._ipa
    else delete w.ipa
    delete w._ipa
  }
  // keep key order: ipa after example_cn, forms last
  const ordered = words.map((w) => {
    const { id, word, pos, pos_cn, definition, example, example_cn, ipa, forms } = w
    return { id, word, pos, pos_cn, definition, example, example_cn, ...(ipa ? { ipa } : {}), ...(forms ? { forms } : {}) }
  })
  writeFileSync(WORDS, JSON.stringify(ordered, null, 2) + '\n')
  console.log('\nwritten')
}
