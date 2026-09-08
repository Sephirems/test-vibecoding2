import { config } from '../config'
import { PersonDetector } from './detection/detector'
import { FrameSampler } from './video/frameSampler'
import { buildTrack } from './tracking/buildTrack'
import { computeCropKeyframes, cropSize } from './crop/computeCrop'
import type { AnalysisResult, DetectionSample, Progress, VideoInfo } from '../types'

type OnProgress = (progress: Progress) => void

/**
 * Runs detection over the video and produces the crop keyframes.
 *
 * We sample a few frames per second rather than every frame: between two
 * samples a person barely moves, and the smoothing pass would erase that
 * detail anyway. This is the main precision/performance trade-off of the app
 * and it is driven by config.analysis.samplesPerSecond.
 */
export async function analyzeVideo(
  info: VideoInfo,
  onProgress: OnProgress,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  onProgress({ stage: 'loading-model', ratio: 0, message: 'Loading the detection model…' })
  const detector = await PersonDetector.create()

  // Frames are downscaled before detection; the model does not need full HD.
  const scale = Math.min(1, config.analysis.detectionMaxSize / info.width)
  const sampleWidth = Math.round(info.width * scale)
  const sampleHeight = Math.round(info.height * scale)

  const sampler = await FrameSampler.create(info.url, sampleWidth, sampleHeight)

  try {
    const interval = 1 / config.analysis.samplesPerSecond
    const sampleCount = Math.max(1, Math.floor(info.duration / interval))
    const samples: DetectionSample[] = []

    for (let i = 0; i < sampleCount; i++) {
      if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError')

      const time = i * interval
      const frame = await sampler.grab(time)
      // detectForVideo requires strictly increasing timestamps.
      const candidates = detector.detect(frame, Math.round(time * 1000) + i)

      // Scale boxes back up to source-video pixels.
      samples.push({
        time,
        candidates: candidates.map((c) => ({
          ...c,
          box: {
            x: c.box.x / scale,
            y: c.box.y / scale,
            width: c.box.width / scale,
            height: c.box.height / scale,
          },
        })),
      })

      onProgress({
        stage: 'detecting',
        ratio: (i + 1) / sampleCount,
        message: `Detecting the subject… frame ${i + 1} of ${sampleCount}`,
      })
    }

    onProgress({ stage: 'tracking', ratio: 1, message: 'Following the subject…' })
    const track = buildTrack(samples, info.width)

    onProgress({ stage: 'smoothing', ratio: 1, message: 'Preparing the framing…' })
    const keyframes = computeCropKeyframes(track, info.width, info.height)
    const { width: cropWidth, height: cropHeight } = cropSize(info.width, info.height)

    return {
      cropWidth,
      cropHeight,
      keyframes,
      track,
      noSubjectFound: track.every((p) => !p.detected),
    }
  } finally {
    sampler.dispose()
    detector.close()
  }
}
