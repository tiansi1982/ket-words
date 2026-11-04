export interface Word {
  id: number
  word: string
  pos: string
  pos_cn: string
  definition: string
  example: string
  example_cn: string
  ipa?: string // British IPA, e.g. "/əˈbaʊt/" — absent for most phrases
  // Inflections that differ from the base spelling (flew, teeth, looks after…),
  // so the example sentence can be highlighted / blanked. Only set when the
  // example itself uses one; validate-words enforces that
  forms?: string[]
}

export type StudyStatus = 'new' | 'learning' | 'mastered'

export interface WordProgress {
  wordId: number
  status: StudyStatus
  correctCount: number
  wrongCount: number
  lastStudied: number // timestamp
  // Wrong answers in a row (reset on any correct answer); ≥2 shows a spelling hint
  consecutiveWrong?: number
  // SRS review schedule, only meaningful once status is 'mastered'.
  // srsLevel indexes SRS_INTERVALS; dueDate is YYYY-MM-DD local,
  // null = graduated (passed all review intervals, no more reviews).
  // Both absent on records saved before SRS existed → treated as due today.
  srsLevel?: number
  dueDate?: string | null
  // Read-aloud tracking (R14). A failed/skipped take also goes through
  // updateProgress(false) — "one word, two questions" — these just keep the
  // speaking side visible on its own for stats and weak-word lists
  speakFailCount?: number
  lastSpeakScore?: number | null // null = skipped / no score
}

// How the child left the read-aloud card
export type SpeakOutcome = 'passed' | 'failed' | 'skipped'

// What happened to one word in today's session (R7 summary page)
export interface SessionResult {
  speak?: SpeakOutcome
  speakScore?: number | null // null = skipped / unscored
  spelled?: boolean
  quiz?: 'spell' | 'dictation' // which prompt the spelling used (F4)
}

// Placement test outcome (F3): sampled accuracy projected onto the dictionary
export interface PlacementRecord {
  date: string // YYYY-MM-DD
  correct: number
  total: number
  estimated: number // estimated words already known
}

export interface DailySession {
  date: string // YYYY-MM-DD (local time)
  wordIds: number[]
  currentIndex: number // resume position within the session
  completed: boolean
  results?: Record<number, SessionResult> // absent on sessions from before R7
}

// One round of error-bank practice (R9): a batch of the bank, resumable
export interface ErrorSession {
  wordIds: number[]
  currentIndex: number
  cleared: number[] // ids that left the bank during this round
}

export interface ProfileMeta {
  id: string
  name: string
}

// Per-profile preferences (R10). Stored partially; read via resolveSettings()
export interface ProfileSettings {
  passScore: number // read-aloud pass mark, 60–100 (default 90)
  autoSpeak: boolean // auto-play word + sentence on the show/result cards
}

// Per-profile learning data. The active profile's copy lives at the top level
// of UserState (so pages read it directly); inactive profiles' copies are
// stashed in profileData and swapped in on switch.
export interface ProfileData {
  dailyGoal: number // words per day, default 20
  currentSession: DailySession | null
  progress: Record<number, WordProgress>
  errorBank: number[] // wordIds in error bank
  dailyLog: Record<string, number> // YYYY-MM-DD (local) → answers that day
  settings?: Partial<ProfileSettings> // absent/partial on data from before R10
  errorSession?: ErrorSession | null // in-progress error-bank round (R9)
  placement?: PlacementRecord | null // last placement test (F3)
}

// Sync account bound to one profile (P3 cloud sync, /api/sync backend)
export interface SyncAccount {
  username: string
  sessionToken: string
  userObjectId: string // server-side user id
  lastSyncAt?: number
  invalid?: boolean // session expired/revoked → needs re-login
}

export interface UserState extends ProfileData {
  activeProfileId: string
  profileList: ProfileMeta[]
  profileData: Record<string, ProfileData> // keyed by profile id, active profile excluded
  syncAccounts: Record<string, SyncAccount> // keyed by profile id
  // Device-level parent PIN (4 digits) gating destructive actions and parent
  // settings; not synced. null/undefined = not set
  parentPin?: string | null
}
