import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision'
import { config } from '../../config'
import type { Candidate } from '../../types'

const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe-wasm`
const MODEL_PATH = `${import.meta.env.BASE_URL}models/efficientdet_lite0.tflite`

/**
 * Thin wrapper around MediaPipe's object detector, restricted to people.
 * Boxes are returned in the coordinate space of the canvas passed to detect().
 */
export class PersonDetector {
  private readonly detector: ObjectDetector

  private constructor(detector: ObjectDetector) {
    this.detector = detector
  }

  static async create(): Promise<PersonDetector> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
    const detector = await ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      scoreThreshold: config.analysis.minConfidence,
      categoryAllowlist: ['person'],
      maxResults: 5,
    })
    return new PersonDetector(detector)
  }

  /** `timestampMs` must strictly increase between calls in VIDEO mode. */
  detect(frame: HTMLCanvasElement, timestampMs: number): Candidate[] {
    const result = this.detector.detectForVideo(frame, timestampMs)
    const candidates: Candidate[] = []

    for (const detection of result.detections) {
      const box = detection.boundingBox
      const category = detection.categories[0]
      if (!box || !category) continue
      candidates.push({
        box: { x: box.originX, y: box.originY, width: box.width, height: box.height },
        confidence: category.score,
        label: category.categoryName,
      })
    }
    return candidates
  }

  close(): void {
    this.detector.close()
  }
}
