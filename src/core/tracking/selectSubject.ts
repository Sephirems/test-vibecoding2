import { config } from '../../config'
import type { Candidate } from '../../types'

/**
 * Picks the main subject among the candidates of a single frame.
 *
 * Four signals, weighted in config.subject:
 *  - area:       a big subject is usually the one the shot is about
 *  - centering:  a subject near the middle is usually the one framed on purpose
 *  - confidence: trust the detector
 *  - continuity: stay on the person we were already following
 *
 * `previousCenterX` is the subject center from the previous sample, or null on
 * the first sample. Keeping this function pure makes it easy to replace later
 * with a smarter re-identification strategy.
 */
export function selectSubject(
  candidates: Candidate[],
  frameWidth: number,
  previousCenterX: number | null,
): Candidate | null {
  if (candidates.length === 0) return null

  const w = config.subject
  const maxArea = Math.max(...candidates.map((c) => c.box.width * c.box.height))

  let best: Candidate | null = null
  let bestScore = -Infinity

  for (const candidate of candidates) {
    const centerX = candidate.box.x + candidate.box.width / 2
    const area = (candidate.box.width * candidate.box.height) / maxArea
    // 1 at the center of the frame, 0 at either edge.
    const centering = 1 - Math.abs(centerX - frameWidth / 2) / (frameWidth / 2)
    const continuity =
      previousCenterX === null ? 0 : 1 - Math.min(1, Math.abs(centerX - previousCenterX) / frameWidth)

    const score =
      w.weightArea * area +
      w.weightCenter * centering +
      w.weightConfidence * candidate.confidence +
      w.weightContinuity * continuity

    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}
