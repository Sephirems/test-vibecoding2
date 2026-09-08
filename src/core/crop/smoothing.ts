import { config } from '../../config'

/**
 * Turns a jittery target signal into a camera movement that looks intentional.
 *
 * Three passes, in this order:
 *
 *  1. Deadzone   - while the target stays close to where the crop already is,
 *                  the crop does not move at all. This is what removes the
 *                  permanent micro-motion that makes auto-reframe look cheap.
 *  2. Zero-phase EMA - a low-pass filter run forwards then backwards. Running
 *                  it both ways cancels the lag a one-way filter introduces,
 *                  which we can afford because the whole track is known
 *                  up-front (we are not doing this live).
 *  3. Speed clamp - hard limit on travel per second, so a bad detection can
 *                  never produce a whip pan.
 *
 * `values` and the result are crop left-edge positions in source pixels.
 */
export function smoothTrack(
  values: number[],
  times: number[],
  cropWidth: number,
  videoWidth: number,
): number[] {
  if (values.length === 0) return []

  const withDeadzone = applyDeadzone(values, cropWidth)
  const filtered = applyZeroPhaseEma(withDeadzone, config.smoothing.emaAlpha)
  const limited = applySpeedLimit(filtered, times, videoWidth)

  const maxX = Math.max(0, videoWidth - cropWidth)
  return limited.map((x) => Math.min(maxX, Math.max(0, x)))
}

function applyDeadzone(values: number[], cropWidth: number): number[] {
  const threshold = (config.smoothing.deadzone * cropWidth) / 2
  const result: number[] = []
  let current = values[0]

  for (const target of values) {
    const delta = target - current
    if (Math.abs(delta) > threshold) {
      // Move only by the part that leaves the deadzone, so the subject ends up
      // sitting on the edge of it rather than snapping back to dead center.
      current += delta - Math.sign(delta) * threshold
    }
    result.push(current)
  }
  return result
}

function applyZeroPhaseEma(values: number[], alpha: number): number[] {
  const forward: number[] = []
  let acc = values[0]
  for (const value of values) {
    acc += alpha * (value - acc)
    forward.push(acc)
  }

  const backward = new Array<number>(forward.length)
  acc = forward[forward.length - 1]
  for (let i = forward.length - 1; i >= 0; i--) {
    acc += alpha * (forward[i] - acc)
    backward[i] = acc
  }
  return backward
}

function applySpeedLimit(values: number[], times: number[], videoWidth: number): number[] {
  const maxSpeed = config.smoothing.maxSpeedPerSecond * videoWidth
  const result: number[] = [values[0]]

  for (let i = 1; i < values.length; i++) {
    const dt = Math.max(1e-3, times[i] - times[i - 1])
    const maxStep = maxSpeed * dt
    const delta = values[i] - result[i - 1]
    result.push(result[i - 1] + Math.max(-maxStep, Math.min(maxStep, delta)))
  }
  return result
}
