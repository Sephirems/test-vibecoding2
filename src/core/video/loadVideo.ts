import { config } from '../../config'
import type { VideoInfo } from '../../types'

/** Thrown for problems we can explain to a normal user. */
export class UserFacingError extends Error {}

/**
 * Loads the file into a hidden <video> element and reads its metadata.
 * Rejects anything we cannot reframe, with a message meant for the UI.
 */
export async function loadVideo(file: File): Promise<VideoInfo> {
  if (!file.type.startsWith('video/')) {
    throw new UserFacingError(
      `"${file.name}" is not a video file (detected type: ${file.type || 'unknown'}).`,
    )
  }

  const sizeMB = file.size / (1024 * 1024)
  if (sizeMB > config.input.maxFileSizeMB) {
    throw new UserFacingError(
      `This video is ${sizeMB.toFixed(0)} MB. The limit is ${config.input.maxFileSizeMB} MB.`,
    )
  }

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () =>
        reject(
          new UserFacingError(
            `The browser could not decode "${file.name}". Try an MP4 file encoded with H.264.`,
          ),
        )
    })
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }

  const { videoWidth: width, videoHeight: height, duration } = video

  const fail = (message: string) => {
    URL.revokeObjectURL(url)
    throw new UserFacingError(message)
  }

  if (!width || !height) {
    fail(`"${file.name}" has no video track, only audio.`)
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    fail(`The duration of "${file.name}" could not be read; the file may be corrupted.`)
  }
  if (duration > config.input.maxDurationSeconds) {
    fail(
      `This video lasts ${Math.round(duration)}s. The limit is ${config.input.maxDurationSeconds}s.`,
    )
  }
  if (width / height < 1) {
    fail(
      `This video is already vertical (${width}x${height}). Auto Reframe expects a horizontal video.`,
    )
  }

  return { file, url, width, height, duration }
}
