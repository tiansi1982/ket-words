// Error-bank change stamps (R02). The bank itself stays a plain id list
// (older clients and backups read it as before); errorBankAt records when
// each word last entered or left it, so a word cleared on one device beats
// an older copy of the bank on another during the sync merge, instead of the
// union bringing it straight back.
//
//   errorBankAt[wordId] = +t  added (or got wrong again) at t
//                       = −t  removed at t
//   t = Date.now(), never 0. A banked id without a stamp (data from before
//   R02) counts as added at time 0, so any stamped change outranks it.
export type ErrorBankStamps = Record<number, number>

// How long a removal is remembered. A device that stays offline longer than
// this and still holds the word may bring it back — that beats keeping
// tombstones forever.
export const ERROR_TOMBSTONE_TTL_MS = 60 * 86_400_000

interface BankData {
  errorBank?: number[]
  errorBankAt?: ErrorBankStamps
}

interface BankEvent {
  in: boolean
  at: number
}

function eventOf(stamps: ErrorBankStamps, banked: ReadonlySet<number>, id: number): BankEvent | null {
  const s = stamps[id]
  if (typeof s === 'number' && Number.isFinite(s) && s !== 0) return { in: s > 0, at: Math.abs(s) }
  return banked.has(id) ? { in: true, at: 0 } : null
}

// Newer change wins; on a tie the word stays in (losing an error is worse
// than practising one twice)
function newer(a: BankEvent | null, b: BankEvent | null): BankEvent | null {
  if (!a || !b) return a ?? b
  if (a.at !== b.at) return a.at > b.at ? a : b
  return a.in ? a : b
}

export function mergeErrorBanks(
  local: BankData,
  remote: BankData,
  now = Date.now()
): { errorBank: number[]; errorBankAt: ErrorBankStamps } {
  const localBank = local.errorBank ?? []
  const remoteBank = remote.errorBank ?? []
  const localAt = local.errorBankAt ?? {}
  const remoteAt = remote.errorBankAt ?? {}
  const localSet = new Set(localBank)
  const remoteSet = new Set(remoteBank)

  // Local order first (the bank's order is "when it entered"), then what only
  // the other side has; stamp-only ids are removals, or adds missing from a
  // malformed bank
  const ids = [
    ...new Set([
      ...localBank,
      ...remoteBank,
      ...Object.keys(localAt).map(Number),
      ...Object.keys(remoteAt).map(Number),
    ]),
  ]

  const errorBank: number[] = []
  const errorBankAt: ErrorBankStamps = {}
  for (const id of ids) {
    if (!Number.isInteger(id)) continue
    const e = newer(eventOf(localAt, localSet, id), eventOf(remoteAt, remoteSet, id))
    if (!e) continue
    if (e.in) {
      errorBank.push(id)
      if (e.at) errorBankAt[id] = e.at
    } else if (now - e.at < ERROR_TOMBSTONE_TTL_MS) {
      errorBankAt[id] = -e.at
    }
  }
  return { errorBank, errorBankAt }
}
