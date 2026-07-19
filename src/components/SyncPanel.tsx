import { useState } from 'react'
import { useUserStore } from '@/store/userStore'
import { syncConfigured, signUp, logIn, syncProfile, syncErrorText } from '@/services/sync'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'

function lastSyncText(ts?: number): string {
  if (!ts) return '尚未同步'
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return '刚刚同步'
  if (mins < 60) return `${mins} 分钟前同步`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前同步`
  return `${Math.floor(hours / 24)} 天前同步`
}

// Cloud sync for the active profile: bind a LeanCloud account, manual sync,
// unbind. Lives at the bottom of the ProfileSwitcher panel.
export default function SyncPanel() {
  const { activeProfileId, syncAccounts, setSyncAccount, patchSyncAccount, clearSyncAccount } =
    useUserStore()
  const account = syncAccounts[activeProfileId]

  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmUnbind, setConfirmUnbind] = useState(false)

  if (!syncConfigured) return null

  const bind = async (mode: 'login' | 'signup') => {
    const name = username.trim()
    if (name.length < 3 || password.length < 6) {
      setError('用户名至少 3 位，密码至少 6 位')
      return
    }
    const taken = Object.entries(syncAccounts).some(
      ([pid, acc]) => pid !== activeProfileId && acc.username === name
    )
    if (taken) {
      setError('这个账号已绑定到另一个孩子')
      return
    }
    setBusy(true)
    setError('')
    try {
      const auth = mode === 'signup' ? await signUp(name, password) : await logIn(name, password)
      setSyncAccount(activeProfileId, {
        username: name,
        sessionToken: auth.sessionToken,
        userObjectId: auth.objectId,
      })
      await syncProfile(activeProfileId)
      setUsername('')
      setPassword('')
    } catch (e) {
      setError(syncErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  // Session expired: log in again with the bound username, keep local data
  const relogin = async () => {
    if (!account || password.length < 6) {
      setError('请输入密码')
      return
    }
    setBusy(true)
    setError('')
    try {
      const auth = await logIn(account.username, password)
      patchSyncAccount(activeProfileId, {
        sessionToken: auth.sessionToken,
        userObjectId: auth.objectId,
        invalid: false,
      })
      await syncProfile(activeProfileId)
      setPassword('')
    } catch (e) {
      setError(syncErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  const manualSync = async () => {
    setBusy(true)
    setError('')
    try {
      await syncProfile(activeProfileId)
    } catch (e) {
      setError(syncErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'min-w-0 flex-1 rounded-xl border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary'

  return (
    <div className="mt-1 border-t border-muted-foreground/10 px-2 pt-1">
      <button
        onClick={() => {
          setOpen(!open)
          setError('')
          setConfirmUnbind(false)
        }}
        className="flex w-full items-center gap-2 rounded-2xl px-1 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {account ? (
          <Cloud className={`h-4 w-4 ${account.invalid ? 'text-destructive' : 'text-primary'}`} />
        ) : (
          <CloudOff className="h-4 w-4" />
        )}
        云同步
        <span className="ml-auto text-xs font-normal">
          {account
            ? account.invalid
              ? '需要重新登录'
              : lastSyncText(account.lastSyncAt)
            : '未绑定账号'}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 px-1 pb-2">
          {!account ? (
            <>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="账号（如 kid1）"
                autoCapitalize="none"
                className={inputCls}
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码（至少 6 位）"
                type="password"
                className={inputCls}
              />
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => bind('login')}
                  className="flex-1 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                >
                  登录绑定
                </button>
                <button
                  disabled={busy}
                  onClick={() => bind('signup')}
                  className="flex-1 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-transform active:scale-95 disabled:opacity-50"
                >
                  注册新账号
                </button>
              </div>
            </>
          ) : account.invalid ? (
            <>
              <p className="text-xs text-muted-foreground">
                账号 <span className="font-semibold">{account.username}</span> 登录已过期
              </p>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                type="password"
                className={inputCls}
              />
              <button
                disabled={busy}
                onClick={relogin}
                className="rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform active:scale-95 disabled:opacity-50"
              >
                重新登录
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-xs text-muted-foreground">
                已绑定 <span className="font-semibold text-foreground">{account.username}</span>
              </span>
              <button
                disabled={busy}
                onClick={manualSync}
                className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
                立即同步
              </button>
              {confirmUnbind ? (
                <button
                  onClick={() => {
                    clearSyncAccount(activeProfileId)
                    setConfirmUnbind(false)
                  }}
                  className="rounded-full bg-destructive px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-transform active:scale-95"
                >
                  确认解绑
                </button>
              ) : (
                <button
                  onClick={() => setConfirmUnbind(true)}
                  className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  解绑
                </button>
              )}
            </div>
          )}
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          {!account && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              绑定后进度会同步到云端，换设备登录同一账号即可继续学习。每个孩子用自己的账号。
            </p>
          )}
        </div>
      )}
    </div>
  )
}
