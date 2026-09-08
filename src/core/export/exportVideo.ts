import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  getFirstEncodableAudioCodec,
  type AudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny'
import { config } from '../../config'
import { cropRectAt } from '../crop/computeCrop'
import { UserFacingError } from '../video/loadVideo'
import type { AnalysisResult, Progress, VideoInfo } from '../../types'

/** True when the browser can run the export at all. */
export function isExportSupported(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window
}

/**
 * Renders the vertical video.
 *
 * Frames are pulled straight from the file's own packets and decoded in order.
 * We deliberately do not seek: seeking forces the decoder to restart from the
 * previous key frame every single time, which was by far the slowest part of
 * the export. Decoding sequentially is several times faster.
 *
 * The audio is copied over untouched whenever the output container accepts its
 * codec, so most exports never pay for an audio re-encode at all.
 */
export async function exportVideo(
  info: VideoInfo,
  analysis: AnalysisResult,
  onProgress: (progress: Progress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!isExportSupported()) {
    throw new UserFacingError(
      'Your browser cannot export video. Use a recent version of Chrome or Edge.',
    )
  }

  const { width, height } = config.output

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(info.file) })
  const videoTrack = await input.getPrimaryVideoTrack()
  if (!videoTrack) {
    throw new UserFacingError('This file has no video track to reframe.')
  }
  if (!(await videoTrack.canDecode())) {
    throw new UserFacingError(
      'This video uses a codec your browser cannot decode. Try an MP4 encoded with H.264.',
    )
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Could not create the 2D context used to render the output frames.')

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  })

  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: config.output.videoBitrate,
    keyFrameInterval: config.output.keyFrameIntervalSeconds,
    latencyMode: 'quality',
  })
  output.addVideoTrack(videoSource)

  const audio = await prepareAudio(input, output)
  await output.start()

  try {
    await renderFrames(videoTrack, analysis, info, ctx, videoSource, onProgress, signal)

    if (audio) {
      onProgress({ stage: 'encoding', ratio: 1, message: 'Adding the audio track...' })
      await audio.run()
    }

    await output.finalize()
    const buffer = output.target.buffer
    if (!buffer) throw new Error('The muxer produced no output buffer.')
    return new Blob([buffer], { type: 'video/mp4' })
  } catch (error) {
    await output.cancel().catch(() => {})
    throw error
  } finally {
    input.dispose()
  }
}

/** Decodes the source in order, draws each crop and encodes it. */
async function renderFrames(
  videoTrack: InputVideoTrack,
  analysis: AnalysisResult,
  info: VideoInfo,
  ctx: CanvasRenderingContext2D,
  videoSource: CanvasSource,
  onProgress: (progress: Progress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const sink = new VideoSampleSink(videoTrack)
  // Frames closer together than this are dropped, capping the output frame rate
  // without ever resampling: emitted timestamps stay those of the source.
  const minFrameGap = 1 / config.output.frameRate

  let nextEmitTime = 0
  let emitted = 0
  let lastProgressAt = 0

  for await (const sample of sink.samples()) {
    try {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

      // A tiny epsilon keeps rounding from dropping an otherwise valid frame.
      if (sample.timestamp + 1e-6 < nextEmitTime) continue
      nextEmitTime = sample.timestamp + minFrameGap

      const crop = cropRectAt(analysis.keyframes, sample.timestamp, info.width, info.height)
      sample.draw(
        ctx,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, ctx.canvas.width, ctx.canvas.height,
      )

      // Duration is left out on purpose: the muxer derives it from the next
      // timestamp, which keeps the timeline correct even when frames are dropped.
      await videoSource.add(sample.timestamp)
      emitted++

      // Throttled so a long export does not trigger a React render per frame.
      const now = performance.now()
      if (now - lastProgressAt > 100) {
        lastProgressAt = now
        onProgress({
          stage: 'encoding',
          ratio: Math.min(1, sample.timestamp / info.duration),
          message: `Generating the vertical video... ${sample.timestamp.toFixed(1)}s of ${info.duration.toFixed(1)}s`,
        })
      }
    } finally {
      sample.close()
    }
  }

  if (emitted === 0) {
    throw new UserFacingError('No frame could be decoded from this video.')
  }
}

interface AudioJob {
  run: () => Promise<void>
}

/**
 * Wires the audio track into the output and returns the job that copies it.
 * Returns null when the file has no audio, or no usable audio, which is not an
 * error: exporting a silent video beats failing the whole export.
 */
async function prepareAudio(input: Input, output: Output): Promise<AudioJob | null> {
  const track = await input.getPrimaryAudioTrack()
  if (!track) return null

  const codec = await track.getCodec()
  const supported = output.format.getSupportedAudioCodecs()

  // Fast path: the container accepts the source codec, so the packets are
  // copied across without decoding or re-encoding anything.
  if (codec && supported.includes(codec)) {
    return copyAudio(track, output, codec)
  }

  return reencodeAudio(track, output, supported)
}

function copyAudio(track: InputAudioTrack, output: Output, codec: AudioCodec): AudioJob {
  const source = new EncodedAudioPacketSource(codec)
  output.addAudioTrack(source)

  return {
    run: async () => {
      const decoderConfig = await track.getDecoderConfig()
      if (!decoderConfig) {
        throw new Error(`Audio track is missing the decoder configuration for codec "${codec}".`)
      }
      let first = true
      for await (const packet of new EncodedPacketSink(track).packets()) {
        // The decoder config only has to travel with the first packet.
        await source.add(packet, first ? { decoderConfig } : undefined)
        first = false
      }
    },
  }
}

async function reencodeAudio(
  track: InputAudioTrack,
  output: Output,
  supported: AudioCodec[],
): Promise<AudioJob | null> {
  const numberOfChannels = await track.getNumberOfChannels()
  const sampleRate = await track.getSampleRate()

  const codec = await getFirstEncodableAudioCodec(supported, { numberOfChannels, sampleRate })
  if (!codec || !(await track.canDecode())) return null

  const source = new AudioSampleSource({ codec, bitrate: config.output.audioBitrate })
  output.addAudioTrack(source)

  return {
    run: async () => {
      for await (const sample of new AudioSampleSink(track).samples()) {
        try {
          await source.add(sample)
        } finally {
          sample.close()
        }
      }
    },
  }
}
