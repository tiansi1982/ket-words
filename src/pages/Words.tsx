import { useMemo, useRef, useState } from 'react'
import { useUserStore, SRS_INTERVALS, KNOWN_SRS_LEVEL } from '@/store/userStore'
import { useWordStore } from '@/store/wordStore'
import { baseWord, displayWord, difficultyOf, type Difficulty } from '@/lib/word-utils'
import { wordStatus, STATUS_META, type WordStatus } from '@/lib/word-status'
import { usePinGate } from '@/lib/use-pin-gate'
import { BackButton } from '@/components/PageHeader'
import VirtualList from '@/components/VirtualList'
import WordDetail from '@/components/WordDetail'
import { Button } from '@/components/ui/button'
import { Search, X, CheckSquare, Square, ChevronRight, CircleCheck, RotateCcw } from 'lucide-react'
import type { Word } from '@/types'

const ROW_H = 68
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const KNOWN_DAYS = SRS_INTERVALS[KNOWN_SRS_LEVEL]

type StatusFilter = 'all' | WordStatus | 'error'
type PosFilter = 'all' | 'n' | 'v' | 'adj' | 'adv' | 'other'
type DiffFilter = 'all' | Difficulty

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '新词' },
  { key: 'learning', label: '学习中' },
  { key: 'due', label: '待复习' },
  { key: 'mastered', label: '已掌握' },
  { key: 'graduated', label: '已巩固' },
  { key: 'error', label: '错题' },
]
const DIFF_FILTERS: { key: DiffFilter; label: string }[] = [
  { key: 'all', label: '全部难度' },
  { key: 'easy', label: '简单' },
  { key: 'medium', label: '中等' },
  { key: 'hard', label: '困难' },
]
const POS_FILTERS: { key: PosFilter; label: string }[] = [
  { key: 'all', label: '全部词性' },
  { key: 'n', label: '名词' },
  { key: 'v', label: '动词' },
  { key: 'adj', label: '形容词' },
  { key: 'adv', label: '副词' },
  { key: 'other', label: '其他' },
]
const posBucket = (pos: string): PosFilter => (pos === 'n' || pos === 'v' || pos === 'adj' || pos === 'adv' ? pos : 'other')

function Chip({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-30 ${
        active ? 'bg-brand-gradient text-white shadow-sm' : 'glass-chip text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

// Word browser (F1) with bulk "already know" / "start over" (F2)
export default function Words() {
  const { progress, errorBank, getTodayDate, markKnown, resetWords } = useUserStore()
  const words = useWordStore((s) => s.words)
  const today = getTodayDate()
  const { guard, dialog } = usePinGate('修改学习状态需要家长 PIN')

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [diff, setDiff] = useState<DiffFilter>('all')
  const [pos, setPos] = useState<PosFilter>('all')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [detail, setDetail] = useState<Word | null>(null)
  const [notice, setNotice] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const errorSet = useMemo(() => new Set(errorBank), [errorBank])
  const sorted = useMemo(
    () => [...words].sort((a, b) => baseWord(a.word).toLowerCase().localeCompare(baseWord(b.word).toLowerCase())),
    [words]
  )
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: words.length, new: 0, learning: 0, due: 0, mastered: 0, graduated: 0, error: errorBank.length }
    for (const w of words) c[wordStatus(progress[w.id], today)]++
    return c
  }, [words, progress, errorBank.length, today])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sorted.filter((w) => {
      if (status === 'error') {
        if (!errorSet.has(w.id)) return false
      } else if (status !== 'all' && wordStatus(progress[w.id], today) !== status) return false
      if (diff !== 'all' && difficultyOf(w.word) !== diff) return false
      if (pos !== 'all' && posBucket(w.pos) !== pos) return false
      if (q && !baseWord(w.word).toLowerCase().includes(q) && !w.definition.includes(q)) return false
      return true
    })
  }, [sorted, query, status, diff, pos, progress, errorSet, today])

  // First row per initial letter in the current list, for the A–Z strip
  const letterIndex = useMemo(() => {
    const m = new Map<string, number>()
    filtered.forEach((w, i) => {
      const letter = baseWord(w.word).charAt(0).toUpperCase()
      if (!m.has(letter)) m.set(letter, i)
    })
    return m
  }, [filtered])
  const jumpTo = (letter: string) => {
    const i = letterIndex.get(letter)
    if (i !== undefined) listRef.current?.scrollTo?.({ top: i * ROW_H })
  }

  const flash = (msg: string) => {
    setNotice(msg)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 3000)
  }
  const toggleSelected = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const exitSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }
  const applyKnown = () => {
    const ids = [...selected]
    if (!ids.length) return
    guard(() => {
      markKnown(ids)
      exitSelecting()
      flash(`已把 ${ids.length} 个词标为已会，${KNOWN_DAYS} 天后开始复习`)
    })
  }
  const applyReset = () => {
    const ids = [...selected]
    if (!ids.length) return
    guard(() => {
      resetWords(ids)
      exitSelecting()
      flash(`已把 ${ids.length} 个词设回新词`)
    })
  }
  const toggleKnownOne = (w: Word, known: boolean) =>
    guard(() => {
      if (known) markKnown([w.id])
      else resetWords([w.id])
      setDetail(null)
      flash(known ? `「${displayWord(w.word)}」已标为已会，${KNOWN_DAYS} 天后开始复习` : `「${displayWord(w.word)}」已设回新词`)
    })

  const renderRow = (w: Word) => {
    const meta = STATUS_META[wordStatus(progress[w.id], today)]
    const isSelected = selected.has(w.id)
    return (
      <button
        onClick={() => (selecting ? toggleSelected(w.id) : setDetail(w))}
        aria-pressed={selecting ? isSelected : undefined}
        className="flex h-full w-full items-center gap-3 border-b border-border/50 px-2 text-left transition-colors hover:bg-muted/50 active:bg-muted/70"
      >
        {selecting &&
          (isSelected ? (
            <CheckSquare className="h-5 w-5 shrink-0 text-primary" />
          ) : (
            <Square className="h-5 w-5 shrink-0 text-muted-foreground/40" />
          ))}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-semibold tracking-tight">{displayWord(w.word)}</span>
            {w.ipa && <span className="truncate font-mono text-[11px] text-muted-foreground">{w.ipa}</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {w.pos_cn} · {w.definition}
          </div>
        </div>
        {errorSet.has(w.id) && <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-label="在错题本" />}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>{meta.label}</span>
        {!selecting && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
      </button>
    )
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-lg flex-col px-5 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-extrabold tracking-tight">单词本</h1>
        <span className="glass-chip ml-auto rounded-full px-3 py-1 text-sm font-semibold tabular-nums text-muted-foreground">
          {filtered.length} / {words.length}
        </span>
        <Button
          variant={selecting ? 'hero' : 'glass'}
          className="h-9 px-3 text-xs"
          onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
        >
          {selecting ? '完成' : '多选'}
        </Button>
      </div>

      <label className="glass-card relative mb-3 flex h-11 items-center gap-2 rounded-2xl px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索英文或中文…"
          aria-label="搜索单词"
          autoCapitalize="none"
          autoCorrect="off"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="清空搜索" className="rounded-full p-1 text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      <div className="-mx-5 mb-2 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
            {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
          </Chip>
        ))}
      </div>
      <div className="-mx-5 mb-2 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {DIFF_FILTERS.map((f) => (
          <Chip key={f.key} active={diff === f.key} onClick={() => setDiff(f.key)}>{f.label}</Chip>
        ))}
        <span className="w-1 shrink-0" />
        {POS_FILTERS.map((f) => (
          <Chip key={f.key} active={pos === f.key} onClick={() => setPos(f.key)}>{f.label}</Chip>
        ))}
      </div>
      <div className="-mx-5 mb-2 flex gap-0.5 overflow-x-auto px-5 [scrollbar-width:none]" aria-label="按首字母跳转">
        {LETTERS.map((l) => (
          <button
            key={l}
            onClick={() => jumpTo(l)}
            disabled={!letterIndex.has(l)}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 disabled:text-muted-foreground/30"
          >
            {l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card flex flex-1 flex-col items-center justify-center gap-2 rounded-[1.5rem] p-8 text-center">
          <div className="text-4xl">🔍</div>
          <p className="text-sm text-muted-foreground">没有符合条件的单词</p>
        </div>
      ) : (
        <VirtualList
          ref={listRef}
          items={filtered}
          rowHeight={ROW_H}
          keyOf={(w) => w.id}
          renderRow={renderRow}
          className={`glass-card min-h-0 flex-1 rounded-[1.5rem] px-2 ${selecting ? 'mb-28' : 'mb-6'}`}
        />
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-5 pb-6">
          <div className="glass-card mx-auto flex max-w-lg items-center gap-2 rounded-[1.4rem] p-3 animate-fade-up">
            <span className="shrink-0 text-sm font-semibold tabular-nums">已选 {selected.size}</span>
            <button
              onClick={() => (selected.size === filtered.length ? setSelected(new Set()) : setSelected(new Set(filtered.map((w) => w.id))))}
              className="shrink-0 text-xs font-medium text-primary"
            >
              {selected.size === filtered.length ? '清空' : `全选 ${filtered.length}`}
            </button>
            <span className="flex-1" />
            <Button variant="glass" className="h-10 gap-1.5 px-3 text-destructive" disabled={!selected.size} onClick={applyReset}>
              <RotateCcw className="h-4 w-4" /> 重新学
            </Button>
            <Button variant="hero" className="h-10 gap-1.5 px-3" disabled={!selected.size} onClick={applyKnown}>
              <CircleCheck className="h-4 w-4" /> 已经会了
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <div role="status" className="glass-card fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium animate-pop-in">
          {notice}
        </div>
      )}

      <WordDetail word={detail} onClose={() => setDetail(null)} onToggleKnown={toggleKnownOne} />
      {dialog}
    </div>
  )
}
