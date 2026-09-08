// Copies the MediaPipe WASM runtime out of node_modules and downloads the
// detection model into public/, so the app never depends on a CDN at runtime.
import { cp, mkdir, writeFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const WASM_SRC = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const WASM_DEST = join(root, 'public/mediapipe-wasm')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite'
const MODEL_DEST = join(root, 'public/models/efficientdet_lite0.tflite')

await cp(WASM_SRC, WASM_DEST, { recursive: true })
console.log('MediaPipe WASM copied to public/mediapipe-wasm')

try {
  await access(MODEL_DEST)
  console.log('Detection model already present, skipping download')
} catch {
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`Model download failed: ${res.status} ${res.statusText} (${MODEL_URL})`)
  await mkdir(dirname(MODEL_DEST), { recursive: true })
  await writeFile(MODEL_DEST, Buffer.from(await res.arrayBuffer()))
  console.log('Detection model downloaded to public/models')
}
