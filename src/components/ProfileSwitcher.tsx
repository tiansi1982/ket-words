import { useState } from 'react'
import { useUserStore } from '@/store/userStore'
import { ChevronDown, Plus, Pencil, Trash2, Check } from 'lucide-react'

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
    <div className="w-full max-w-sm">
      <button
        onClick={toggleOpen}
        className="mx-auto flex items-center gap-1.5 rounded-full border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="text-base">👤</span>
        {active?.name}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 bg-card border rounded-2xl p-2 shadow-sm">
          <p className="text-xs text-muted-foreground text-center py-1">谁在学？</p>

          {profileList.map((p) => (
            <div key={p.id} className="flex items-center gap-1 rounded-xl px-2 py-1.5 hover:bg-muted/50">
              {renamingId === p.id ? (
                <>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                    className="flex-1 min-w-0 border rounded-lg px-2 py-1 text-sm bg-background outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button onClick={submitRename} className="p-1.5 text-primary">
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
                    className={`flex-1 text-left text-sm px-1 py-1 ${
                      p.id === activeProfileId ? 'font-bold text-primary' : ''
                    }`}
                  >
                    {p.name}
                    {p.id === activeProfileId && ' ✓'}
                  </button>
                  <button
                    onClick={() => {
                      setRenamingId(p.id)
                      setDraft(p.name)
                      setConfirmDeleteId(null)
                    }}
                    className="p-1.5 text-muted-foreground hover:text-foreground"
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
                        className="rounded-lg bg-destructive px-2 py-1 text-xs text-destructive-foreground"
                      >
                        确认删除
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive"
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
                className="flex-1 min-w-0 border rounded-lg px-2 py-1 text-sm bg-background outline-none focus:ring-2 focus:ring-primary"
              />
              <button onClick={submitAdd} className="p-1.5 text-primary">
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
              className="flex w-full items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> 添加孩子
            </button>
          )}
        </div>
      )}
    </div>
  )
}
