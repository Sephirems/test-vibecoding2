/** A rectangle in source-video pixel coordinates. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** One candidate subject found by the detector on a single sampled frame. */
export interface Candidate {
  box: Rect
  confidence: number
  label: string
}

/** The detector output for one sampled frame. */
export interface DetectionSample {
  /** Seconds from the start of the video. */
  time: number
  candidates: Candidate[]
}

/** The subject chosen for one sampled frame, in source pixels. */
export interface TrackPoint {
  time: number
  /** Horizontal center of the subject. */
  centerX: number
  /** True when this point comes from a real detection rather than a fallback. */
  detected: boolean
}

/** The final, smoothed horizontal position of the crop over time. */
export interface CropKeyframe {
  time: number
  /** Left edge of the crop window, in source pixels. */
  x: number
}

export interface VideoInfo {
  file: File
  url: string
  width: number
  height: number
  duration: number
}

/** Result of the analysis phase, everything the preview and export need. */
export interface AnalysisResult {
  cropWidth: number
  cropHeight: number
  keyframes: CropKeyframe[]
  /** Raw pre-smoothing track, kept for debugging and the preview overlay. */
  track: TrackPoint[]
  /** True when the detector never found a subject; the crop stays centered. */
  noSubjectFound: boolean
}

export type PipelineStage =
  | 'idle'
  | 'loading-model'
  | 'detecting'
  | 'tracking'
  | 'smoothing'
  | 'encoding'
  | 'done'

export interface Progress {
  stage: PipelineStage
  /** 0 to 1 within the current stage. */
  ratio: number
  message: string
}
