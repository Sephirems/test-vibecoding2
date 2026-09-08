import { config } from '../../config'
import type { CropKeyframe, Rect, TrackPoint } from '../../types'
import { smoothTrack } from './smoothing'

/**
 * The crop window is as tall as the source and as wide as 9:16 allows.
 * Only its horizontal position changes over time.
 */
export function cropSize(videoWidth: number, videoHeight: number) {
  const ratio = config.output.width / config.output.height
  const width = Math.min(videoWidth, Math.round(videoHeight * ratio))
  const height = Math.round(width / ratio)
  return { width, height: Math.min(height, videoHeight) }
}

/** Converts the subject track into smoothed, in-bounds crop keyframes. */
export function computeCropKeyframes(
  track: TrackPoint[],
  videoWidth: number,
  videoHeight: number,
): CropKeyframe[] {
  const { width: cropWidth } = cropSize(videoWidth, videoHeight)
  const maxX = Math.max(0, videoWidth - cropWidth)

  const times = track.map((p) => p.time)
  const rawX = track.map((p) => {
    const left = p.centerX - cropWidth / 2
    return Math.min(maxX, Math.max(0, left))
  })

  const smoothed = smoothTrack(rawX, times, cropWidth, videoWidth)
  return smoothed.map((x, i) => ({ time: times[i], x }))
}

/**
 * Crop rectangle at an arbitrary time, linearly interpolated between the two
 * surrounding keyframes. Used by both the preview and the exporter, so what
 * the user sees is exactly what gets rendered.
 */
export function cropRectAt(
  keyframes: CropKeyframe[],
  time: number,
  videoWidth: number,
  videoHeight: number,
): Rect {
  const { width, height } = cropSize(videoWidth, videoHeight)
  const y = Math.round((videoHeight - height) / 2)

  if (keyframes.length === 0) {
    return { x: Math.round((videoWidth - width) / 2), y, width, height }
  }
  if (time <= keyframes[0].time) {
    return { x: keyframes[0].x, y, width, height }
  }

  const last = keyframes[keyframes.length - 1]
  if (time >= last.time) {
    return { x: last.x, y, width, height }
  }

  // Keyframes are evenly spaced, so we can index directly instead of searching.
  const step = keyframes.length > 1 ? keyframes[1].time - keyframes[0].time : 1
  const index = Math.min(keyframes.length - 2, Math.floor((time - keyframes[0].time) / step))
  const a = keyframes[index]
  const b = keyframes[index + 1]
  const t = (time - a.time) / (b.time - a.time)

  return { x: a.x + (b.x - a.x) * t, y, width, height }
}
