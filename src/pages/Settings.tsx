import { useRef, useState, type ReactNode } from 'react'
import { useUserStore } from '@/store/userStore'
import { useSettings } from '@/lib/use-settings'
import { DEFAULT_SETTINGS, PASS_SCORE_MAX, PASS_SCORE_MIN, PASS_SCORE_STEP, PIN_LENGTH, isValidPin } from '@/lib/settings'
import { usePinGate } from '@/lib/use-pin-gate'
import { BackButton } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { Target, Volume2, Mic, Lock, LockOpen, ClipboardList, Download, Upload } from 'lucide-react'
import { mergeProfileData } from '@/services/sync'
import { makeBackup, backupFilename, parseBackup, describeData } from '@/lib/backup'

const GOALS = [10, 20, 30, 50]

function Section({ icon, tile, title, children }: { icon: ReactNode; tile: string; title: string; children: ReactNode }) {
  return (
    <section className="glass-card mb-4 rounded-[1.75rem] p-5 animate-fade-up">
      <div className="mb-4 flex items-center gap-3">
        <span className={`icon-tile h-9 w-9 rounded-xl ${tile}`}>{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-gradient' : 'bg-muted-foreground/25'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5.5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, PIN_LENGTH)
const pinInputCls =
  'glass-card h-12 w-full rounded-2xl text-center font-mono text-xl tracking-[0.5em] outline-none focus:ring-3 focus:ring-primary/40'

// Settings (R10): learning preferences for the active profile, the parent-only
// pass mark, and the device-level parent PIN.
export default function Settings() {
  const navigate = useNavigate()
  const { dailyGoal, setDailyGoal, parentPin, setParentPin, updateSettings, placement, activeProfileId, profileList, getProfileData, applyProfileData } = useUserStore()
  const profileName = profileList.find((p) => p.id === activeProfileId)?.name ?? ''
  const settings = useSettings()
  const { guard, dialog } = usePinGate()

  // Parent area stays unlocked for the rest of this visit once the PIN was entered
  const [unlocked, setUnlocked] = useState(false)
  const parentLocked = !!parentPin && !unlocked

  // Backup (F9)
  const fileInput = useRef<HTMLInputElement>(null)
  const [backupMsg, setBackupMsg] = useState('')
  const exportBackup = () => {
    const data = getProfileData(activeProfileId)
    if (!data) return
    const text = JSON.stringify(makeBackup(profileName, data), null, 2)
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFilename(profileName)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setBackupMsg(`已导出 ${a.download}`)
  }
  const importBackup = async (file: File) => {
    const parsed = parseBackup(await file.text())
    if (!parsed) {
      setBackupMsg('这不是 KET 单词的备份文件')
      return
    }
    guard(() => {
      const local = getProfileData(activeProfileId)
      if (!local) return
      applyProfileData(activeProfileId, mergeProfileData(local, parsed.data))
      setBackupMsg(`已合并${parsed.profileName ? `「${parsed.profileName}」` : ''}的备份：${describeData(parsed.data)}`)
    })
  }

  const [pinMode, setPinMode] = useState<'set' | 'change' | null>(null)
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinError, setPinError] = useState('')

  const openPinEditor = (mode: 'set' | 'change') => {
    setPinMode(mode)
    setPin1('')
    setPin2('')
    setPinError('')
  }
  const savePin = () => {
    if (!isValidPin(pin1)) return setPinError(`PIN 必须是 ${PIN_LENGTH} 位数字`)
    if (pin1 !== pin2) return setPinError('两次输入的不一样')
    setParentPin(pin1)
    setUnlocked(true)
    setPinMode(null)
  }

  return (
    <div className="min-h-screen flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
      <div className="mb-7 flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-extrabold tracking-tight">设置</h1>
      </div>

      <Section icon={<Target className="h-4 w-4" />} tile="bg-linear-to-br from-sky-400 to-blue-600" title="每日目标">
        <div className="glass-chip flex gap-1 rounded-full p-1">
          {GOALS.map((n) => (
            <button
              key={n}
              onClick={() => setDailyGoal(n)}
              aria-pressed={dailyGoal === n}
              className={`flex-1 rounded-full py-2 text-sm font-semibold tabular-nums transition-all duration-200 ${
                dailyGoal === n ? 'bg-brand-gradient text-white shadow-md' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {n} 个
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">到期复习的词优先占名额，剩下的才是新词。</p>
      </Section>

      <Section icon={<Volume2 className="h-4 w-4" />} tile="bg-linear-to-br from-teal-400 to-emerald-600" title="朗读与音效">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">自动朗读</div>
            <p className="text-xs text-muted-foreground">进入单词卡和答题结果时自动读单词 + 例句；关掉后点喇叭才读</p>
          </div>
          <Toggle checked={settings.autoSpeak} onChange={(v) => updateSettings({ autoSpeak: v })} label="自动朗读" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-border/60 pt-4">
          <div>
            <div className="text-sm font-medium">答题音效</div>
            <p className="text-xs text-muted-foreground">答对、答错、完成学习时的小提示音</p>
          </div>
          <Toggle checked={settings.sounds} onChange={(v) => updateSettings({ sounds: v })} label="答题音效" />
        </div>
      </Section>

      <Section icon={<Mic className="h-4 w-4" />} tile="bg-linear-to-br from-orange-400 to-rose-500" title="跟读通过线（家长）">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-extrabold tracking-tight tabular-nums text-gradient">{settings.passScore} 分</div>
            <p className="mt-1 text-xs text-muted-foreground">
              云评分达到这个分数才算过关；默认 {DEFAULT_SETTINGS.passScore}，刚开始可以先放宽到 80
            </p>
          </div>
          {parentLocked && (
            <Button variant="glass" className="h-9 gap-1.5 px-3 text-xs" onClick={() => guard(() => setUnlocked(true))}>
              <Lock className="h-3.5 w-3.5" /> 解锁修改
            </Button>
          )}
        </div>
        <input
          type="range"
          min={PASS_SCORE_MIN}
          max={PASS_SCORE_MAX}
          step={PASS_SCORE_STEP}
          value={settings.passScore}
          disabled={parentLocked}
          aria-label="跟读通过线"
          onChange={(e) => updateSettings({ passScore: Number(e.target.value) })}
          className="mt-4 w-full accent-primary disabled:opacity-40"
        />
        <div className="mt-1 flex justify-between text-[10px] font-medium text-muted-foreground tabular-nums">
          <span>{PASS_SCORE_MIN} 宽松</span>
          <span>{PASS_SCORE_MAX} 严格</span>
        </div>
      </Section>

      <Section
        icon={parentPin ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        tile="bg-linear-to-br from-violet-500 to-indigo-600"
        title="家长 PIN"
      >
        {pinMode ? (
          <div className="flex flex-col gap-2.5">
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="新 PIN"
              aria-label="新 PIN"
              value={pin1}
              onChange={(e) => { setPin1(onlyDigits(e.target.value)); setPinError('') }}
              className={pinInputCls}
            />
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="再输一次"
              aria-label="再输一次新 PIN"
              value={pin2}
              onChange={(e) => { setPin2(onlyDigits(e.target.value)); setPinError('') }}
              onKeyDown={(e) => e.key === 'Enter' && savePin()}
              className={pinInputCls}
            />
            {pinError && <p className="text-xs font-medium text-destructive">{pinError}</p>}
            <div className="flex gap-2">
              <Button variant="glass" className="h-10 flex-1" onClick={() => setPinMode(null)}>取消</Button>
              <Button variant="hero" className="h-10 flex-1" onClick={savePin}>保存</Button>
            </div>
          </div>
        ) : parentPin ? (
          <>
            <p className="text-sm">已设置。删除档案、解绑云同步、修改通过线时需要输入。</p>
            <div className="mt-3 flex gap-2">
              <Button variant="glass" className="h-10 flex-1" onClick={() => guard(() => openPinEditor('change'))}>修改 PIN</Button>
              <Button variant="glass" className="h-10 flex-1 text-destructive" onClick={() => guard(() => setParentPin(null))}>清除 PIN</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">未设置。设置后，删除档案、解绑云同步、修改通过线都要先输入 {PIN_LENGTH} 位数字。</p>
            <Button variant="hero" className="mt-3 h-10 w-full" onClick={() => openPinEditor('set')}>设置家长 PIN</Button>
          </>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          PIN 只保存在这台设备上，用来防止孩子误触，不是安全措施。忘记 PIN 时只能清除浏览器数据重来，所以建议先绑定云同步。
        </p>
      </Section>

      <Section icon={<Download className="h-4 w-4" />} tile="bg-linear-to-br from-emerald-400 to-green-600" title="备份">
        <p className="text-sm text-muted-foreground">
          把「{profileName}」的学习进度导出成文件，换设备时导入即可；导入是合并，不会丢掉这台设备上的记录。
          不想注册云同步账号的话用这个。
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="hero" className="h-10 flex-1 gap-1.5" onClick={exportBackup}>
            <Download className="h-4 w-4" /> 导出
          </Button>
          <Button variant="glass" className="h-10 flex-1 gap-1.5" onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> 导入
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            aria-label="选择备份文件"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void importBackup(f)
            }}
          />
        </div>
        {backupMsg && <p role="status" className="mt-2 text-xs font-medium text-muted-foreground">{backupMsg}</p>}
      </Section>

      <Section icon={<ClipboardList className="h-4 w-4" />} tile="bg-linear-to-br from-amber-400 to-orange-500" title="摸底测试">
        <p className="text-sm text-muted-foreground">
          {placement
            ? `上次 ${placement.date}：${placement.total} 题答对 ${placement.correct} 题，预计已认识约 ${placement.estimated} 个词。`
            : '还没做过。40 道识别题，答对的词直接标为已会，并据此调整每天新词的难度。'}
        </p>
        <Button variant="glass" className="mt-3 h-10 w-full" onClick={() => navigate('/placement')}>
          {placement ? '再测一次' : '去做摸底测试'}
        </Button>
      </Section>

      {dialog}
    </div>
  )
}
