// Records the child's voice so they can play it back against the TTS reading.
// Web Speech recognition proved unusable on the devices kids actually use
// (Chinese-brand Android delegates to vendor engines, iOS home-screen PWAs
// rarely get audio through), so speak practice is record-and-compare instead
// of machine-scored.

export interface RecorderService {
  isSupported(): boolean
  // Ask for the mic and start recording; rejects if permission is denied.
  // Returns the live stream so callers can tap it (e.g. cloud scoring).
  start(): Promise<MediaStream>
  // Stop and return the finished recording
  stop(): Promise<Blob>
  // Drop any in-flight recording and release the mic
  cancel(): void
}

// Each browser records the container it can also play back, so playback of
// our own recording never needs transcoding
const CANDIDATE_TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']

function pickMimeType(): string | undefined {
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
}

class MediaRecorderService implements RecorderService {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  // Bumped by cancel() (and so by every start()): a start whose permission
  // prompt resolves after that is stale (R07)
  private gen = 0

  isSupported(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  }

  async start(): Promise<MediaStream> {
    this.cancel()
    const gen = this.gen
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Cancelled (page left) or superseded (another start) while the
    // permission prompt / device was busy: release this mic instead of
    // recording on it unseen (R07)
    if (gen !== this.gen) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('recording cancelled')
    }
    this.stream = stream
    try {
      const mimeType = pickMimeType()
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      this.recorder = rec
      this.chunks = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data)
      }
      rec.start()
    } catch (e) {
      this.release() // a recorder that failed to start must not keep the mic
      throw e
    }
    return stream
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder
      if (!rec || rec.state === 'inactive') {
        reject(new Error('not recording'))
        return
      }
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' })
        this.release()
        resolve(blob)
      }
      rec.onerror = () => {
        this.release()
        reject(new Error('recording failed'))
      }
      rec.stop()
    })
  }

  cancel(): void {
    this.gen++
    const rec = this.recorder
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null
      rec.ondataavailable = null
      try {
        rec.stop()
      } catch { /* already stopped */ }
    }
    this.release()
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.recorder = null
    this.chunks = []
  }
}

export const recorder: RecorderService = new MediaRecorderService()
