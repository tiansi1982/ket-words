#!/usr/bin/env node
// 词库数据校验（R4）。`npm test` 与 CI 都会先跑这一步。
//
//   错误（退出码 1）：ID 不递增 / 必填字段缺失 / 词性与中文词性不一致 /
//                    同拼写同词性重复 / 音标格式错误或是词典碎片 / 例句超 15 词 /
//                    未知字段 / word-aliases.ts 与词库不一致 /
//                    例句里找不到原形或 forms 变形 / forms 与例句或基础拼写不符 /
//                    音标含剑桥英音符号集之外的字符（F11）
//   警告（只打印）：  单词缺音标 / 预生成音频缺失或多余
//
// 用法：node scripts/validate-words.mjs [--strict]   --strict 时警告也算失败
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')

const words = JSON.parse(readFileSync(path.join(root, 'src/data/ket-words.json'), 'utf8'))
const aliasSource = readFileSync(path.join(root, 'src/lib/word-aliases.ts'), 'utf8')

const errors = []
const warnings = new Map() // category → messages
const err = (m) => errors.push(m)
const warn = (category, m) => {
  if (!warnings.has(category)) warnings.set(category, [])
  warnings.get(category).push(m)
}

// 与 src/lib/word-utils.ts 保持一致（校验脚本不引入 TS，手动同步）
const acceptedSpellings = (word) => {
  const stripped = word.replace(/ \([^)]*\)/g, '').trim()
  if (!stripped.includes('(')) return [stripped]
  return [stripped.replace(/\(([^)]*)\)/g, ''), stripped.replace(/\(([^)]*)\)/g, '$1')]
}
const baseWord = (word) => acceptedSpellings(word)[0]
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// 与 scripts/generate-audio.py 的 filename_for() 一致
const audioFile = (text) => createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 16) + '.mp3'

const POS_CN = { adj: '形容词', adv: '副词', n: '名词', v: '动词', prep: '介词', 'phr v': '短语动词', exclam: '感叹词' }
// 剑桥词典风格英音符号集（与 scripts/ipa-normalize.mjs 的 ALLOWED 一致）：
// 辅音 p b t d k ɡ f v θ ð s z ʃ ʒ h m n ŋ l r w j（tʃ dʒ 由两个字符组成），
// 元音 ɪ e æ ʌ ɒ ʊ ə i u 与 iː ɑː ɔː uː ɜː，双元音 eɪ aɪ ɔɪ əʊ aʊ ɪə eə ʊə，
// 重音 ˈ ˌ、音节点 .、词组内空格。美音的 ɹ ɚ ɝ oʊ ɾ ɫ ʔ 等一律不允许
const IPA_ALLOWED = new Set([...'pbtdkɡfvθðszʃʒhmnŋlrwjɪeæʌɒʊəiuɑɔɜaːˈˌ. '])
const KNOWN_FIELDS = new Set(['id', 'word', 'pos', 'pos_cn', 'definition', 'example', 'example_cn', 'ipa', 'forms'])
const REQUIRED = ['word', 'pos', 'pos_cn', 'definition', 'example', 'example_cn']

if (!Array.isArray(words) || words.length === 0) {
  console.error('ket-words.json 不是非空数组')
  process.exit(1)
}

let prevId = 0
const byKey = new Map()
for (const w of words) {
  const where = `#${w.id} ${JSON.stringify(w.word)}`

  if (!Number.isInteger(w.id) || w.id <= prevId) err(`${where}: id 必须是严格递增的正整数（上一个是 ${prevId}）`)
  prevId = typeof w.id === 'number' ? w.id : prevId

  for (const f of REQUIRED) {
    if (typeof w[f] !== 'string' || !w[f].trim()) err(`${where}: 字段 ${f} 缺失或为空`)
  }
  for (const k of Object.keys(w)) {
    if (!KNOWN_FIELDS.has(k)) err(`${where}: 未知字段 ${k}`)
  }
  if (typeof w.word !== 'string' || typeof w.example !== 'string') continue

  if (!(w.pos in POS_CN)) err(`${where}: 未知词性 ${JSON.stringify(w.pos)}`)
  else if (POS_CN[w.pos] !== w.pos_cn) err(`${where}: pos_cn 应为 ${POS_CN[w.pos]}，现为 ${w.pos_cn}`)

  const key = `${w.word}|${w.pos}`
  if (byKey.has(key)) err(`${where}: 与 #${byKey.get(key)} 重复（同拼写同词性）`)
  byKey.set(key, w.id)

  if (w.ipa !== undefined) {
    if (typeof w.ipa !== 'string' || !/^\/[^/[\]]+\/$/.test(w.ipa)) err(`${where}: 音标格式应为 /…/，现为 ${JSON.stringify(w.ipa)}`)
    else if (/^\/-|-\/$/.test(w.ipa)) err(`${where}: 音标是词典的前缀/后缀碎片 ${w.ipa}`)
    else {
      const bad = [...w.ipa.slice(1, -1)].filter((ch) => !IPA_ALLOWED.has(ch))
      if (bad.length) err(`${where}: 音标含非英音/非剑桥符号 ${[...new Set(bad)].join(' ')}（${w.ipa}）；手写到 scripts/ipa-overrides.json 后运行 ipa-normalize.mjs --write`)
      else if (/[^iɑɔuɜ]ː/.test(w.ipa)) err(`${where}: 长音只允许 iː ɑː ɔː uː ɜː（${w.ipa}）`)
    }
  } else if (!baseWord(w.word).includes(' ')) {
    warn('单词缺音标', where)
  }

  const wordCount = w.example.trim().split(/\s+/).length
  if (wordCount > 15) err(`${where}: 例句超过 15 词（${wordCount}）`)

  if (w.forms !== undefined && (!Array.isArray(w.forms) || !w.forms.every((f) => typeof f === 'string' && f.trim()))) {
    err(`${where}: forms 必须是非空字符串数组`)
  }
  const forms = [...acceptedSpellings(w.word), ...(Array.isArray(w.forms) ? w.forms : [])]
  const inExample = forms.some((f) => new RegExp(`\\b${escapeRe(f)}\\w*`, 'i').test(w.example))
  if (!inExample) err(`${where}: 例句里找不到原形或 forms 变形：${JSON.stringify(w.example)}（给词条加 forms: ["变形"]）`)
  // forms are only for inflections the example actually uses — keep the data honest
  if (Array.isArray(w.forms)) {
    const spellings = acceptedSpellings(w.word)
    const used = w.forms.filter((f) => new RegExp(`\\b${escapeRe(f)}\\b`, 'i').test(w.example))
    if (used.length === 0) err(`${where}: forms 里没有一个出现在例句里`)
    if (w.forms.some((f) => spellings.includes(f))) err(`${where}: forms 不应重复基础拼写`)
  }
}

// word-aliases.ts：移除的 ID 不能还在，保留的 ID 必须存在
const ids = new Set(words.map((w) => w.id))
let aliasCount = 0
for (const m of aliasSource.matchAll(/^\s*(\d+):\s*(\d+),/gm)) {
  aliasCount++
  const removed = Number(m[1])
  const kept = Number(m[2])
  if (ids.has(removed)) err(`word-aliases: 已移除的 ID ${removed} 仍在词库中`)
  if (!ids.has(kept)) err(`word-aliases: 保留的 ID ${kept} 不在词库中`)
}
if (aliasCount === 0) err('word-aliases: 没有解析到任何映射，文件格式可能变了')

// 预生成音频覆盖
const audioDir = path.join(root, 'public/audio')
if (existsSync(audioDir)) {
  const have = new Set(readdirSync(audioDir).filter((f) => f.endsWith('.mp3')))
  const need = new Map()
  for (const w of words) {
    if (typeof w.word !== 'string' || typeof w.example !== 'string') continue
    for (const text of [baseWord(w.word), w.example]) need.set(audioFile(text), text)
  }
  const missing = [...need].filter(([f]) => !have.has(f))
  if (missing.length) {
    for (const [, t] of missing) warn('缺预生成音频（播放时退回 Web Speech；运行 scripts/generate-audio.py 补齐）', JSON.stringify(t))
  }
  const orphans = [...have].filter((f) => !need.has(f))
  for (const f of orphans) warn('音频文件不再被任何词条引用（可删除）', f)
}

// 警告按类别汇总，每类最多列 5 条，避免淹没真正的错误
const SHOW = 5
let warningCount = 0
for (const [category, items] of warnings) {
  warningCount += items.length
  console.warn(`⚠️  ${category}：${items.length} 条`)
  for (const item of items.slice(0, SHOW)) console.warn(`     ${item}`)
  if (items.length > SHOW) console.warn(`     … 还有 ${items.length - SHOW} 条`)
}
for (const e of errors) console.error(`❌ ${e}`)
console.log(`validate-words: ${words.length} 词条，${errors.length} 个错误，${warningCount} 个警告`)
if (errors.length || (strict && warningCount)) process.exit(1)
