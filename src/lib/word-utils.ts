// 词条文本处理：词库中的 word 字段可能带两类括号
// 1. 空格前置的消歧注释："design (DRAWING)"、"listen (to)" → 拼写/朗读只用 "design"、"listen"
// 2. 内联可选字母："blond(e)"、"photo(graph)" → 两种拼法 blond/blonde 都算对

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// 返回该词条所有可接受的拼写形式
export function acceptedSpellings(word: string): string[] {
  const stripped = word.replace(/ \([^)]*\)/g, '').trim()
  if (!stripped.includes('(')) return [stripped]
  const short = stripped.replace(/\(([^)]*)\)/g, '')
  const long = stripped.replace(/\(([^)]*)\)/g, '$1')
  return [short, long]
}

// 用于 TTS 朗读和跟读展示的基础拼写（不含括号内容）
export function baseWord(word: string): string {
  return acceptedSpellings(word)[0]
}

// 界面展示用：去掉空格前置的消歧注释（中文释义已能区分词义），
// 保留内联可选字母以提示两种拼法："design (DRAWING)" → "design"，"blond(e)" 原样
export function displayWord(word: string): string {
  return word.replace(/ \([^)]*\)/g, '').trim()
}

// 难度分桶：按基础拼写的总字母数（忽略空格等非字母），
// 词组如 "ice cream"（8 字母）不再只按第一个词算成简单
export type Difficulty = 'easy' | 'medium' | 'hard'
export function difficultyOf(word: string): Difficulty {
  const n = baseWord(word).replace(/[^a-z]/gi, '').length
  return n <= 4 ? 'easy' : n <= 7 ? 'medium' : 'hard'
}

export function matchesSpelling(input: string, word: string): boolean {
  const n = normalize(input)
  return acceptedSpellings(word).some((s) => normalize(s) === n)
}

// 例句中目标词（或其变形，如 go → goes、fly → flew）的位置，用于高亮/挖空。
// 先试 forms 里的不规则变形（更长、更具体），再试各个可接受拼写 + 任意后缀
// （"grand(d)ad" 的例句用的是 granddad）；都找不到返回 null（校验脚本会报错）
export function findInExample(
  example: string,
  word: string,
  forms: readonly string[] = []
): { index: number; length: number } | null {
  const candidates = [...forms, ...acceptedSpellings(word)]
  for (const c of candidates) {
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = example.match(new RegExp(`\\b${escaped}\\w*`, 'i'))
    if (m && m.index !== undefined) return { index: m.index, length: m[0].length }
  }
  return null
}

// 拼写提示：每个单词只露首字母，其余用下划线占位
// "ice cream" → "i__ c____"
export function spellingHint(word: string): string {
  return baseWord(word)
    .split(' ')
    .map((t) => t[0] + '_'.repeat(Math.max(0, t.length - 1)))
    .join(' ')
}

// 复制后 Fisher-Yates 打乱，不修改原数组
export function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
