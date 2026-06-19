import type { MemberInfo } from './useCanvasInvites'

interface MemberListProps {
  members: string[]
  pendingInvites: string[]
  memberInfo: Record<string, MemberInfo>
  presenceUids: string[]
  onRemoveMember: (uid: string) => void
  onCancelInvite: (email: string) => void
}

// The members and pending-invites lists inside the share modal, each with a presence
// dot / status chip and a remove button. Presentational only.
export function MemberList({
  members,
  pendingInvites,
  memberInfo,
  presenceUids,
  onRemoveMember,
  onCancelInvite,
}: MemberListProps) {
  if (members.length === 0 && pendingInvites.length === 0) return null
  return (
    <div className="mt-5 border-t-2 border-dashed border-ink/20 pt-4 flex flex-col gap-4 max-h-64 overflow-y-auto">
      {members.length > 0 && (
        <div>
          <p className="font-hand text-xs text-ink/40 uppercase tracking-wider mb-2">
            Members ({members.length})
          </p>
          {Object.keys(memberInfo).length === 0 && (
            <p className="font-body text-xs text-ink/30 italic">Loading…</p>
          )}
          <ul className="flex flex-col gap-2">
            {members.map((uid) => {
              const info = memberInfo[uid]
              return (
                <li key={uid} className="flex items-center gap-2">
                  <div className="relative shrink-0">
                    <div className="w-7 h-7 rounded-full border-2 border-ink overflow-hidden bg-muted flex items-center justify-center">
                      {info?.photoURL ? (
                        <img src={info.photoURL} alt={info.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="font-hand text-xs text-ink">
                          {info?.displayName?.[0]?.toUpperCase() ?? '?'}
                        </span>
                      )}
                    </div>
                    {presenceUids.includes(uid) && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm text-ink truncate">
                      {info?.displayName ?? uid}
                    </p>
                    {info?.email && (
                      <p className="font-body text-xs text-ink/40 truncate">{info.email}</p>
                    )}
                  </div>
                  <button
                    className="shrink-0 font-body text-xs text-ink/30 hover:text-accent transition-colors px-1.5 py-0.5 border border-ink/20 hover:border-accent"
                    style={{ borderRadius: '4px 8px 4px 8px / 8px 4px 8px 4px' }}
                    onClick={() => onRemoveMember(uid)}
                    title="Remove member"
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {pendingInvites.length > 0 && (
        <div>
          <p className="font-hand text-xs text-ink/40 uppercase tracking-wider mb-2">
            Pending ({pendingInvites.length})
          </p>
          <ul className="flex flex-col gap-2">
            {pendingInvites.map((inviteEmail) => (
              <li key={inviteEmail} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full border-2 border-dashed border-ink/30 flex items-center justify-center shrink-0">
                  <span className="font-body text-xs text-ink/30">?</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm text-ink/60 truncate">{inviteEmail}</p>
                  <span
                    className="font-body text-[10px] px-1.5 py-0.5 bg-muted border border-ink/20 text-ink/40"
                    style={{ borderRadius: '4px 8px 4px 8px / 8px 4px 8px 4px' }}
                  >
                    pending
                  </span>
                </div>
                <button
                  className="shrink-0 font-body text-xs text-ink/30 hover:text-accent transition-colors px-1.5 py-0.5 border border-ink/20 hover:border-accent"
                  style={{ borderRadius: '4px 8px 4px 8px / 8px 4px 8px 4px' }}
                  onClick={() => onCancelInvite(inviteEmail)}
                  title="Cancel invite"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
