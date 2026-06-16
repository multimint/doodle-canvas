import { useState } from 'react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel?: () => void
}

export function ConfirmModal({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, onConfirm, onCancel,
}: Props) {
  const [closing, setClosing] = useState(false)

  const dismiss = (cb?: () => void) => {
    setClosing(true)
    setTimeout(() => cb?.(), 200)
  }

  return (
    <div
      className={closing ? 'm-modal-overlay m-modal-overlay-out' : 'm-modal-overlay'}
      onPointerDown={e => { if (e.target === e.currentTarget) dismiss(onCancel) }}
    >
      <div
        className={`m-modal ${closing ? 'm-pop-out' : 'm-pop-in'}`}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="m-h3" style={{ marginBottom: 8 }}>{title}</div>
        <div className="m-lead" style={{ fontSize: 14.5 }}>{message}</div>
        <div className="m-row m-g10" style={{ marginTop: 22, justifyContent: 'flex-end' }}>
          {onCancel && (
            <button className="m-btn m-btn-ghost" onClick={() => dismiss(onCancel)}>
              {cancelLabel}
            </button>
          )}
          <button
            className="m-btn"
            onClick={() => dismiss(onConfirm)}
            style={danger
              ? { background: 'var(--m-coral)', color: '#fff', boxShadow: 'none' }
              : { background: 'var(--m-primary)', color: '#fff', boxShadow: 'none' }
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
