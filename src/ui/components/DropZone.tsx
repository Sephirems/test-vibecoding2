import { useCallback, useRef, useState } from 'react'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

/** Drag & drop plus a classic file picker, both feeding the same handler. */
export function DropZone({ onFile, disabled }: Props) {
  const [isDragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(false)
      if (disabled) return
      const file = event.dataTransfer.files[0]
      if (file) onFile(file)
    },
    [onFile, disabled],
  )

  return (
    <div
      className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <div className="dropzone__icon">↓</div>
      <p className="dropzone__title">Drop a horizontal video here</p>
      <p className="dropzone__hint">MP4 or MOV · up to 500 MB · nothing leaves your computer</p>
      <button type="button" className="button" disabled={disabled}>
        Choose a file
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
