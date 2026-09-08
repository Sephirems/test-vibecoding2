/**
 * Every tunable value of the auto-reframe pipeline lives here.
 * Nothing in core/ should hard-code a magic number.
 */
export const config = {
  /** Output frame. 1080x1920 is the 9:16 standard for social platforms. */
  output: {
    width: 1080,
    height: 1920,
    /** Frames per second of the exported video. */
    frameRate: 30,
    /** Video bitrate in bits per second. 8 Mbps keeps 1080x1920 clean. */
    videoBitrate: 8_000_000,
    /** How often a key frame is emitted, in seconds. Lower = easier seeking, bigger file. */
    keyFrameIntervalSeconds: 2,
    /** Audio bitrate in bits per second, only used when the source audio must be re-encoded. */
    audioBitrate: 128_000,
  },

  analysis: {
    /** How many frames per second we run the detector on. */
    samplesPerSecond: 4,
    /** Detections below this confidence are discarded. */
    minConfidence: 0.4,
    /** Longest side the frame is downscaled to before detection (speed). */
    detectionMaxSize: 640,
  },

  /** Weights used to pick the main subject among several candidates. */
  subject: {
    weightArea: 1.0,
    weightCenter: 0.4,
    weightConfidence: 0.6,
    /** Keeps the framing on the same person instead of hopping around. */
    weightContinuity: 1.6,
    /** After this long without any detection, the crop drifts back to center. */
    maxLostSeconds: 1.0,
  },

  smoothing: {
    /**
     * Exponential moving average factor, per sample, in [0, 1].
     * Lower = smoother but slower to follow.
     */
    emaAlpha: 0.18,
    /**
     * The crop ignores the subject while it stays within this fraction of the
     * crop width around the center. This is what removes constant micro-motion.
     */
    deadzone: 0.2,
    /** Maximum crop travel per second, as a fraction of the video width. */
    maxSpeedPerSecond: 0.25,
  },

  input: {
    /** Rejected above this size, to keep memory usage sane. */
    maxFileSizeMB: 500,
    /** Rejected above this duration. */
    maxDurationSeconds: 600,
  },
} as const

export type Config = typeof config
