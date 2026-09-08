import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { config } from '../../config'
import { cropRectAt } from '../crop/computeCrop'
import { FrameSampler } from '../video/frameSampler'
import { decodeAudio, encodeAudioInto } from './encodeAudio'
import { UserFacingError } from '../video/loadVideo'
import type { AnalysisResult, Progress, VideoInfo } from '../../types'

/** True when the browser can run the export at all. */
export function isExportSupported(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'AudioEncoder' in window
}

/**
 * Renders the vertical video: for every output frame we seek the source, draw
 * the crop rectangle into a 1080x1920 canvas, and encode it. The audio track is
 * decoded and re-encoded separately, then muxed into the same MP4.
 */
export async function exportVideo(
  info: VideoInfo,
  analysis: AnalysisResult,
  onProgress: (progress: Progress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!isExportSupported()) {
    throw new UserFacingError(
      'Your browser cannot export video. Use a recent version of Chrome or Edge.',
    )
  }

  const { width, height, frameRate } = config.output
  const totalFrames = Math.max(1, Math.floor(info.duration * frameRate))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create the 2D context used to render the output frames.')

  onProgress({ stage: 'encoding', ratio: 0, message: 'Reading the audio track…' })
  const audio = await decodeAudio(info.file)

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate },
    audio: audio
      ? { codec: 'aac', numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate }
      : undefined,
    fastStart: 'in-memory',
  })

  let encoderError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      encoderError = new Error(`Video encoding failed: ${error.message}`)
    },
  })

  encoder.configure({
    codec: 'avc1.640028', // H.264 High profile, level 4.0
    width,
    height,
    bitrate: config.output.videoBitrate,
    framerate: frameRate,
  })

  const sampler = await FrameSampler.create(info.url, info.width, info.height)

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
      if (encoderError) throw encoderError

      const time = i / frameRate
      const source = await sampler.grab(time)
      const crop = cropRectAt(analysis.keyframes, time, info.width, info.height)

      ctx.drawImage(
        source,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, width, height,
      )

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(time * 1_000_000),
        duration: Math.round(1_000_000 / frameRate),
      })
      // A keyframe every 2 seconds keeps the file seekable.
      encoder.encode(frame, { keyFrame: i % (frameRate * 2) === 0 })
      frame.close()

      onProgress({
        stage: 'encoding',
        ratio: (i + 1) / totalFrames,
        message: `Generating the vertical video… frame ${i + 1} of ${totalFrames}`,
      })

      if (encoder.encodeQueueSize > 8) {
        await new Promise<void>((resolve) => {
          encoder.ondequeue = () => {
            if (encoder.encodeQueueSize <= 2) resolve()
          }
        })
      }
    }

    await encoder.flush()
    if (encoderError) throw encoderError

    if (audio) {
      onProgress({ stage: 'encoding', ratio: 1, message: 'Adding the audio track…' })
      await encodeAudioInto(muxer, audio)
    }

    muxer.finalize()
    return new Blob([muxer.target.buffer], { type: 'video/mp4' })
  } finally {
    sampler.dispose()
    if (encoder.state !== 'closed') encoder.close()
  }
}
