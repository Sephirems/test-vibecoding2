/**
 * Seek-based frame access.
 *
 * We deliberately do not demux the file ourselves: seeking a <video> element
 * and drawing it to a canvas is deterministic, works with every format the
 * browser can play, and is fast enough for a few frames per second.
 */
export class FrameSampler {
  private readonly video: HTMLVideoElement
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D

  private constructor(video: HTMLVideoElement, width: number, height: number) {
    this.video = video
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Could not create a 2D canvas context for frame sampling.')
    this.ctx = ctx
  }

  /** `width`/`height` are the size frames are drawn at (used to downscale). */
  static async create(url: string, width: number, height: number): Promise<FrameSampler> {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    // Required so the frame is actually decoded and drawable after a seek.
    video.preload = 'auto'

    await new Promise<void>((resolve, reject) => {
      video.oncanplay = () => resolve()
      video.onerror = () => reject(new Error(`Frame sampler could not open the video (${url}).`))
    })

    return new FrameSampler(video, width, height)
  }

  /** Seeks to `time` (seconds) and returns the decoded frame as a canvas. */
  async grab(time: number): Promise<HTMLCanvasElement> {
    await this.seek(time)
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    return this.canvas
  }

  private seek(time: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onSeeked = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error(`Seeking to ${time.toFixed(2)}s failed.`))
      }
      const cleanup = () => {
        this.video.removeEventListener('seeked', onSeeked)
        this.video.removeEventListener('error', onError)
      }
      this.video.addEventListener('seeked', onSeeked)
      this.video.addEventListener('error', onError)
      // Clamp: seeking exactly to the duration never fires 'seeked'.
      this.video.currentTime = Math.min(time, Math.max(0, this.video.duration - 0.001))
    })
  }

  dispose(): void {
    this.video.removeAttribute('src')
    this.video.load()
  }
}
