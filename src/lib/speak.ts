import { tts } from '@/services/tts'
import { baseWord } from '@/lib/word-utils'
import type { Word } from '@/types'

// Listening = the word followed by its example sentence
export const speakWordAndExample = (w: Word) => tts.speakAll([baseWord(w.word), w.example])
