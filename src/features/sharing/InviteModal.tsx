import type { CanvasDoc } from '../../lib/types'
import { useCanvasInvites } from './useCanvasInvites'
import { MemberList } from './MemberList'

interface Props {
  canvas: CanvasDoc
  onClose: () => void
  presenceUids?: string[]
}

export function InviteModal({ canvas, onClose, presenceUids = [] }: Props) {
  const { email, setEmail, status, message, memberInfo, invite, removeMember, cancelInvite } =
    useCanvasInvites(canvas)

  return (
    <div
      className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white border-[3px] border-ink shadow-hard-lg p-6 w-full max-w-md"
        style={{ borderRadius: '15px 185px 25px 155px / 185px 15px 155px 25px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tape */}
        <div
          className="absolute -top-4 left-1/2 -translate-x-1/2 w-16 h-6 bg-muted/60 border border-ink/20 rotate-1"
          style={{ borderRadius: '3px 5px 4px 3px / 4px 3px 5px 4px' }}
        />

        <div className="flex items-start justify-between mb-5">
          <h2 className="font-hand text-2xl text-ink">Share "{canvas.title}"</h2>
          <button
            className="font-body text-ink/40 hover:text-accent text-lg leading-none ml-4 mt-1"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={invite} className="flex gap-2 mb-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Collaborator's email"
            disabled={status === 'sending'}
            required
            autoFocus
            className="flex-1 font-body text-sm text-ink bg-paper border-2 border-ink px-3 py-2 outline-none focus:border-blue-pen placeholder:text-ink/30"
            style={{ borderRadius: '15px 55px 15px 55px / 55px 15px 55px 15px' }}
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="font-body text-sm px-4 py-2 bg-white border-[3px] border-ink shadow-hard transition-all duration-100 hover:bg-accent hover:text-white hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
          >
            {status === 'sending' ? '…' : 'Invite'}
          </button>
        </form>

        {message && (
          <p className={`font-body text-sm mt-1 ${status === 'done' ? 'text-green-600' : 'text-accent'}`}>
            {message}
          </p>
        )}

        <MemberList
          members={canvas.members}
          pendingInvites={canvas.pendingInvites}
          memberInfo={memberInfo}
          presenceUids={presenceUids}
          onRemoveMember={removeMember}
          onCancelInvite={cancelInvite}
        />
      </div>
    </div>
  )
}
