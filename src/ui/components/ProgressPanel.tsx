import type { Progress } from '../../types'

const STEPS: { stage: Progress['stage']; label: string }[] = [
  { stage: 'loading-model', label: 'Loading the model' },
  { stage: 'detecting', label: 'Detecting the subject' },
  { stage: 'tracking', label: 'Following the subject' },
  { stage: 'smoothing', label: 'Preparing the framing' },
  { stage: 'encoding', label: 'Generating the video' },
]

/** Shows which step is running rather than a generic spinner. */
export function ProgressPanel({ progress }: { progress: Progress }) {
  const currentIndex = STEPS.findIndex((s) => s.stage === progress.stage)

  return (
    <div className="progress">
      <p className="progress__message">{progress.message}</p>
      <div className="progress__bar">
        <div className="progress__fill" style={{ width: `${progress.ratio * 100}%` }} />
      </div>
      <ol className="progress__steps">
        {STEPS.map((step, index) => {
          const state =
            progress.stage === 'done' || index < currentIndex
              ? 'done'
              : index === currentIndex
                ? 'active'
                : 'todo'
          return (
            <li key={step.stage} className={`progress__step progress__step--${state}`}>
              {step.label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
