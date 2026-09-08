import { config } from '../../config'
import type { DetectionSample, TrackPoint } from '../../types'
import { selectSubject } from './selectSubject'

/**
 * Turns per-frame detections into one continuous horizontal track.
 *
 * Handles the two awkward cases:
 *  - the subject is briefly hidden -> hold the last known position
 *  - the subject is gone for a while -> drift back to the center of the frame
 */
export function buildTrack(samples: DetectionSample[], frameWidth: number): TrackPoint[] {
  const track: TrackPoint[] = []
  const center = frameWidth / 2

  let lastCenterX: number | null = null
  let lastDetectionTime: number | null = null

  for (const sample of samples) {
    const subject = selectSubject(sample.candidates, frameWidth, lastCenterX)

    if (subject) {
      lastCenterX = subject.box.x + subject.box.width / 2
      lastDetectionTime = sample.time
      track.push({ time: sample.time, centerX: lastCenterX, detected: true })
      continue
    }

    if (lastCenterX === null || lastDetectionTime === null) {
      // Nothing has ever been detected: stay centered.
      track.push({ time: sample.time, centerX: center, detected: false })
      continue
    }

    // Hold the last position, then ease back to the center once the subject
    // has been missing for longer than maxLostSeconds.
    const lostFor = sample.time - lastDetectionTime
    const drift = Math.min(1, Math.max(0, lostFor / config.subject.maxLostSeconds - 1))
    track.push({
      time: sample.time,
      centerX: lastCenterX + (center - lastCenterX) * drift,
      detected: false,
    })
  }

  return track
}
