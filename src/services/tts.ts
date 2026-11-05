export interface TTSService {
  speak(text: string, lang?: string): void
  // Speak several texts back to back (e.g. word, then its example sentence)
  speakAll(texts: string[], lang?: string): void
  stop(): void
  isSupported(): boolean
}

// 预生成音频的文件名约定：sha1(text) 前 16 位十六进制。
// 必须与 scripts/generate-audio.py 的 filename_for() 保持一致。
const hashCache = new Map<string, string>()
async function audioUrlFor(text: string): Promise<string> {
  let hash = hashCache.get(text)
  if (!hash) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
    hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16)
    hashCache.set(text, hash)
  }
  return `/audio/${hash}.mp3`
}

// 优先播放预生成的神经语音音频（音质不受设备影响，可离线缓存），
// 音频缺失或加载失败时退回设备自带的 Web Speech 合成。
class AudioFirstTTS implements TTSService {
  private synth = 'speechSynthesis' in window ? window.speechSynthesis : null
  private session = 0
  private abortCurrent: (() => void) | null = null

  isSupported(): boolean {
    return true
  }

  speak(text: string, lang = 'en-GB'): void {
    this.speakAll([text], lang)
  }

  speakAll(texts: string[], lang = 'en-GB'): void {
    this.stop()
    void this.run(texts, lang, this.session)
  }

  stop(): void {
    this.session++
    this.abortCurrent?.()
    this.abortCurrent = null
    this.synth?.cancel()
  }

  private async run(texts: string[], lang: string, session: number): Promise<void> {
    for (const text of texts) {
      if (session !== this.session) return
      const played = await this.playAudio(text, session)
      if (session !== this.session) return
      if (!played) await this.speakFallback(text, lang)
    }
  }

  private async playAudio(text: string, session: number): Promise<boolean> {
    // crypto.subtle 仅在安全上下文可用（https / localhost），否则直接走回退
    if (!crypto.subtle) return false
    const url = await audioUrlFor(text)
    // 算哈希期间已被 stop() 或新的朗读取代：不再开始播放，否则会在孩子开始录音后才响起（R08）
    if (session !== this.session) return true
    let abort: (() => void) | null = null
    return new Promise<boolean>((resolve) => {
      const audio = new Audio(url)
      // _redirects 会把缺失文件重写成 index.html（200），解码失败同样触发 error
      audio.onended = () => resolve(true)
      audio.onerror = () => resolve(false)
      abort = () => {
        audio.pause()
        resolve(true) // 主动中止不算失败，不要再走 Web Speech 念一遍
      }
      this.abortCurrent = abort
      audio.play().catch(() => resolve(false))
    }).finally(() => {
      // 只清理自己的取消句柄：此时它可能已属于新的一段朗读
      if (this.abortCurrent === abort) this.abortCurrent = null
    })
  }

  private speakFallback(text: string, lang: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.synth) return resolve()
      const utt = new SpeechSynthesisUtterance(text)
      utt.lang = lang
      utt.rate = 0.9
      utt.onend = () => resolve()
      utt.onerror = () => resolve()
      this.synth.speak(utt)
    })
  }
}

export const tts: TTSService = new AudioFirstTTS()
