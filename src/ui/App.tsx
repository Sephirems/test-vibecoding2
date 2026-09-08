import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeVideo } from '../core/analyze'
import { exportVideo, isExportSupported } from '../core/export/exportVideo'
import { loadVideo, UserFacingError } from '../core/video/loadVideo'
import type { AnalysisResult, Progress, VideoInfo } from '../types'
import { DropZone } from './components/DropZone'
import { PreviewPlayer } from './components/PreviewPlayer'
import { ProgressPanel } from './components/ProgressPanel'

const IDLE: Progress = { stage: 'idle', ratio: 0, message: '' }

export function App() {
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [progress, setProgress] = useState<Progress>(IDLE)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const supported = isExportSupported()

  useEffect(() => () => abortRef.current?.abort(), [])

  const reportError = useCallback((cause: unknown) => {
    if (cause instanceof DOMException && cause.name === 'AbortError') return
    setError(
      cause instanceof UserFacingError
        ? cause.message
        : `Something went wrong: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }, [])

  /** Import then analyse in one go: the user drops a file and waits once. */
  const handleFile = useCallback(
    async (file: File) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setError(null)
      setAnalysis(null)
      setBusy(true)

      let loaded: VideoInfo | null = null
      try {
        loaded = await loadVideo(file)
        setInfo(loaded)

        const result = await analyzeVideo(loaded, setProgress, controller.signal)
        setAnalysis(result)
        setProgress({ stage: 'done', ratio: 1, message: 'Ready.' })

        if (result.noSubjectFound) {
          setError('No person was detected — the framing stays centered on the video.')
        }
      } catch (cause) {
        if (loaded) URL.revokeObjectURL(loaded.url)
        setInfo(null)
        setProgress(IDLE)
        reportError(cause)
      } finally {
        setBusy(false)
      }
    },
    [reportError],
  )

  const handleExport = useCallback(async () => {
    if (!info || !analysis) return
    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    setBusy(true)
    try {
      const blob = await exportVideo(info, analysis, setProgress, controller.signal)
      setProgress({ stage: 'done', ratio: 1, message: 'Export finished.' })

      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = info.file.name.replace(/\.[^.]+$/, '') + '-vertical.mp4'
      link.click()
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(link.href), 60_000)
    } catch (cause) {
      reportError(cause)
    } finally {
      setBusy(false)
    }
  }, [info, analysis, reportError])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    if (info) URL.revokeObjectURL(info.url)
    setInfo(null)
    setAnalysis(null)
    setProgress(IDLE)
    setError(null)
  }, [info])

  return (
    <div className="app">
      <header className="header">
        <h1 className="header__title">Auto Reframe</h1>
        <p className="header__subtitle">
          Turn your horizontal videos into vertical ones, automatically.
        </p>
      </header>

      {!supported && (
        <p className="banner banner--warning">
          This browser does not support video export. Use a recent Chrome or Edge.
        </p>
      )}

      {!info && <DropZone onFile={handleFile} disabled={busy} />}

      {info && (
        <section className="workspace">
          <div className="workspace__meta">
            <span>{info.file.name}</span>
            <span>
              {info.width}×{info.height} · {info.duration.toFixed(1)}s
            </span>
            <button type="button" className="button button--ghost" onClick={reset} disabled={busy}>
              Use another video
            </button>
          </div>

          {busy && <ProgressPanel progress={progress} />}

          {analysis && (
            <>
              <PreviewPlayer info={info} analysis={analysis} />
              <div className="actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={handleExport}
                  disabled={busy || !supported}
                >
                  Export the vertical video
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {error && <p className="banner banner--error">{error}</p>}
    </div>
  )
}
