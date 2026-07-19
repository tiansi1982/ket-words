import { useState } from 'react'
import { useUserStore } from '@/store/userStore'
import { ChevronDown, Plus, Pencil, Trash2, Check } from 'lucide-react'
import SyncPanel from '@/components/SyncPanel'

// "谁在学?" — switch between kids' profiles on the home page
export default function ProfileSwitcher() {
  const { profileList, activeProfileId, addProfile, switchProfile, renameProfile, deleteProfile } =
    useUserStore()

  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const active = profileList.find((p) => p.id === activeProfileId)

  const toggleOpen = () => {
    setOpen(!open)
    setAdding(false)
    setRenamingId(null)
    setConfirmDeleteId(null)
    setDraft('')
  }

  const submitAdd = () => {
    if (!draft.trim()) return
    addProfile(draft)
    setDraft('')
    setAdding(false)
    setOpen(false)
  }

  const submitRename = () => {
    if (renamingId && draft.trim()) renameProfile(renamingId, draft)
    setRenamingId(null)
    setDraft('')
  }

  return (
    <div className="w-full">
      <button
        onClick={toggleOpen}
        className="glass-chip mx-auto flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground hover:shadow-md active:scale-[0.97]"
      >
        <span className="icon-tile h-7 w-7 rounded-full bg-brand-gradient text-xs font-bold">
          {active?.name?.slice(0, 1) ?? '👤'}
        </span>
        {active?.name}
        <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="glass-card mt-3 rounded-[1.5rem] p-2 animate-pop-in">
          <p className="py-1.5 text-center text-xs font-medium text-muted-foreground">谁在学？</p>

          {profileList.map((p) => (
            <div key={p.id} className="flex items-center gap-1 rounded-2xl px-2 py-1 transition-colors hover:bg-muted/60">
              {renamingId === p.id ? (
                <>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                    className="min-w-0 flex-1 rounded-xl border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button onClick={submitRename} className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/10">
                    <Check className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      switchProfile(p.id)
                      setOpen(false)
                    }}
                    className={`flex flex-1 items-center gap-2.5 px-1 py-1.5 text-left text-sm ${
                      p.id === activeProfileId ? 'font-bold text-primary' : 'font-medium'
                    }`}
                  >
                    {/* icon-tile forces white text, so inactive tiles use their own muted scheme */}
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${
                        p.id === activeProfileId
                          ? 'icon-tile bg-brand-gradient'
                          : 'bg-muted-foreground/15 text-foreground/70'
                      }`}
                    >
                      {p.name.slice(0, 1)}
                    </span>
                    {p.name}
                    {p.id === activeProfileId && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      setRenamingId(p.id)
                      setDraft(p.name)
                      setConfirmDeleteId(null)
                    }}
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {profileList.length > 1 &&
                    (confirmDeleteId === p.id ? (
                      <button
                        onClick={() => {
                          deleteProfile(p.id)
                          setConfirmDeleteId(null)
                        }}
                        className="rounded-full bg-destructive px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-transform active:scale-95"
                      >
                        确认删除
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ))}
                </>
              )}
            </div>
          ))}

          {adding ? (
            <div className="flex items-center gap-1 px-2 py-1.5">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
                placeholder="孩子的名字..."
                className="min-w-0 flex-1 rounded-xl border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <button onClick={submitAdd} className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/10">
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setAdding(true)
                setDraft('')
                setRenamingId(null)
                setConfirmDeleteId(null)
              }}
              className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-muted-foreground/40">
                <Plus className="h-3.5 w-3.5" />
              </span>
              添加孩子
            </button>
          )}

          <SyncPanel />
        </div>
      )}
    </div>
  )
}
