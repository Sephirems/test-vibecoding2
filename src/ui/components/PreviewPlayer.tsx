import { useEffect, useRef } from 'react'
import { cropRectAt } from '../../core/crop/computeCrop'
import { config } from '../../config'
import type { AnalysisResult, VideoInfo } from '../../types'

interface Props {
  info: VideoInfo
  analysis: AnalysisResult
}

/**
 * Side-by-side preview driven by a single <video> element:
 * left, the source with the crop window drawn on top; right, that same crop
 * rendered at the output ratio. Both use cropRectAt, so what is shown here is
 * exactly what the exporter will produce.
 */
export function PreviewPlayer({ info, analysis }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const resultRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const overlay = overlayRef.current
    const result = resultRef.current
    if (!video || !overlay || !result) return

    overlay.width = info.width
    overlay.height = info.height
    result.width = config.output.width
    result.height = config.output.height

    const overlayCtx = overlay.getContext('2d')
    const resultCtx = result.getContext('2d')
    if (!overlayCtx || !resultCtx) return

    let frameId = 0
    const draw = () => {
      const crop = cropRectAt(analysis.keyframes, video.currentTime, info.width, info.height)

      overlayCtx.clearRect(0, 0, overlay.width, overlay.height)
      overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      overlayCtx.fillRect(0, 0, crop.x, overlay.height)
      overlayCtx.fillRect(crop.x + crop.width, 0, overlay.width - crop.x - crop.width, overlay.height)
      overlayCtx.strokeStyle = '#5b8cff'
      overlayCtx.lineWidth = Math.max(3, info.width / 300)
      overlayCtx.strokeRect(crop.x, crop.y, crop.width, crop.height)

      resultCtx.drawImage(
        video,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, result.width, result.height,
      )

      frameId = requestAnimationFrame(draw)
    }
    draw()

    return () => cancelAnimationFrame(frameId)
  }, [info, analysis])

  return (
    <div className="preview">
      <div className="preview__pane">
        <h3 className="preview__label">Original — 16:9</h3>
        <div className="preview__stage">
          <video ref={videoRef} src={info.url} controls loop className="preview__video" />
          <canvas ref={overlayRef} className="preview__overlay" />
        </div>
      </div>
      <div className="preview__pane preview__pane--vertical">
        <h3 className="preview__label">Result — 9:16</h3>
        <canvas ref={resultRef} className="preview__result" />
      </div>
    </div>
  )
}
