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

// 用于 TTS 朗读和发音评估的基础拼写（不含括号内容）
export function baseWord(word: string): string {
  return acceptedSpellings(word)[0]
}

export function matchesSpelling(input: string, word: string): boolean {
  const n = normalize(input)
  return acceptedSpellings(word).some((s) => normalize(s) === n)
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
