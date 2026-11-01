import { tts } from '@/services/tts'
import { baseWord } from '@/lib/word-utils'
import type { Word } from '@/types'

// Reading below this score counts as a miss and goes to the error bank
export const PASS_SCORE = 90

// Listening = the word followed by its example sentence
export const speakWordAndExample = (w: Word) => tts.speakAll([baseWord(w.word), w.example])
