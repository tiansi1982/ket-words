export interface TTSService {
  speak(text: string, lang?: string): void
  // Speak several texts back to back (e.g. word, then its example sentence)
  speakAll(texts: string[], lang?: string): void
  stop(): void
  isSupported(): boolean
}

class WebSpeechTTS implements TTSService {
  private synth = window.speechSynthesis

  isSupported(): boolean {
    return 'speechSynthesis' in window
  }

  speak(text: string, lang = 'en-GB'): void {
    this.speakAll([text], lang)
  }

  speakAll(texts: string[], lang = 'en-GB'): void {
    if (!this.isSupported()) return
    this.synth.cancel()
    for (const text of texts) {
      const utt = new SpeechSynthesisUtterance(text)
      utt.lang = lang
      utt.rate = 0.9
      this.synth.speak(utt) // queued after the previous utterance
    }
  }

  stop(): void {
    if (this.isSupported()) this.synth.cancel()
  }
}

export const tts: TTSService = new WebSpeechTTS()
