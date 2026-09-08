import { config } from '../../config'
import type { Muxer, ArrayBufferTarget } from 'mp4-muxer'

/** Number of samples per AAC frame; also the chunk size we feed the encoder. */
const FRAME_SIZE = 1024

export interface AudioTrackInfo {
  numberOfChannels: number
  sampleRate: number
}

/**
 * Decodes the whole audio track with the Web Audio API. Returns null when the
 * file simply has no audio, which is not an error.
 */
export async function decodeAudio(file: File): Promise<AudioBuffer | null> {
  const context = new OfflineAudioContext({ length: 1, sampleRate: 48000 })
  try {
    return await context.decodeAudioData(await file.arrayBuffer())
  } catch {
    // decodeAudioData throws for video files with no audio track, and for
    // codecs the browser cannot decode. Either way we export a silent video.
    return null
  }
}

/**
 * Re-encodes an AudioBuffer to AAC and pushes it into the muxer.
 *
 * The audio is independent from the reframing: we decode it, re-encode it and
 * mux it alongside the cropped video so the export keeps its sound.
 */
export async function encodeAudioInto(
  muxer: Muxer<ArrayBufferTarget>,
  buffer: AudioBuffer,
): Promise<void> {
  const { numberOfChannels, sampleRate, length } = buffer

  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (error) => {
      throw new Error(`Audio encoding failed: ${error.message}`)
    },
  })

  encoder.configure({
    codec: 'mp4a.40.2', // AAC-LC
    numberOfChannels,
    sampleRate,
    bitrate: config.output.audioBitrate,
  })

  // WebCodecs wants interleaved f32 for AAC; AudioBuffer stores planar.
  const channels: Float32Array[] = []
  for (let c = 0; c < numberOfChannels; c++) channels.push(buffer.getChannelData(c))

  for (let offset = 0; offset < length; offset += FRAME_SIZE) {
    const frames = Math.min(FRAME_SIZE, length - offset)
    const interleaved = new Float32Array(frames * numberOfChannels)

    for (let c = 0; c < numberOfChannels; c++) {
      const channel = channels[c]
      for (let i = 0; i < frames; i++) {
        interleaved[i * numberOfChannels + c] = channel[offset + i]
      }
    }

    const data = new AudioData({
      format: 'f32',
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: interleaved,
    })
    encoder.encode(data)
    data.close()

    // Keep the encoder queue short so memory stays flat on long videos.
    if (encoder.encodeQueueSize > 16) {
      await new Promise<void>((resolve) => {
        encoder.ondequeue = () => {
          if (encoder.encodeQueueSize <= 4) resolve()
        }
      })
    }
  }

  await encoder.flush()
  encoder.close()
}
