import { Icon, MCOLORS } from '../../lib/icons'

// Shown when the user has no canvases at all — invites them to create their first.
export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        textAlign: 'center',
        gap: 20,
        padding: '36px 20px',
      }}
    >
      <div style={{ position: 'relative', width: 168, height: 132 }}>
        <div
          className='m-blob'
          style={{
            left: 4,
            top: 6,
            width: 38,
            height: 38,
            background: MCOLORS[2],
            opacity: 0.55,
            ['--rot' as string]: '-8deg',
          }}
        />
        <div
          className='m-blob'
          style={{
            right: 0,
            top: 26,
            width: 26,
            height: 26,
            background: MCOLORS[1],
            opacity: 0.55,
            ['--rot' as string]: '12deg',
          }}
        />
        <div
          className='m-blob'
          style={{
            left: 30,
            bottom: 0,
            width: 22,
            height: 22,
            background: MCOLORS[3],
            opacity: 0.5,
            ['--rot' as string]: '6deg',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '16px 30px',
            borderRadius: 22,
            border: '2.5px dashed var(--m-line-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,.6)',
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 16,
              background: 'var(--m-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow:
                '0 10px 22px color-mix(in oklab,var(--m-primary) 40%,transparent)',
            }}
          >
            <Icon name='plus' size={28} color='#fff' />
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          maxWidth: 380,
        }}
      >
        <div className='m-h2' style={{ fontSize: 25 }}>
          Nothing here yet
        </div>
        <div className='m-lead' style={{ fontSize: 15 }}>
          Your canvases will show up here. Start a fresh one and invite your team
          to think out loud together.
        </div>
      </div>
      <button className='m-btn m-btn-primary m-btn-lg' onClick={onCreate}>
        <Icon name='plus' size={18} color='#fff' /> New canvas
      </button>
    </div>
  )
}

// Shown when a search matches no canvases — offers to clear the query.
export function NoResultsState({
  query,
  onClear,
}: {
  query: string
  onClear: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        textAlign: 'center',
        gap: 20,
        padding: '36px 20px',
      }}
    >
      <div style={{ position: 'relative', width: 168, height: 132 }}>
        <span
          style={{
            position: 'absolute',
            left: 4,
            top: 6,
            fontSize: 64,
            fontFamily: 'var(--disp)',
            fontWeight: 700,
            color: MCOLORS[6],
            opacity: 0.55,
            transform: 'rotate(-18deg)',
            lineHeight: 1,
          }}
        >
          ?
        </span>
        <span
          style={{
            position: 'absolute',
            right: 0,
            top: 26,
            fontSize: 44,
            fontFamily: 'var(--disp)',
            fontWeight: 700,
            color: MCOLORS[4],
            opacity: 0.55,
            transform: 'rotate(14deg)',
            lineHeight: 1,
          }}
        >
          ?
        </span>
        <span
          style={{
            position: 'absolute',
            left: 30,
            bottom: 0,
            fontSize: 36,
            fontFamily: 'var(--disp)',
            fontWeight: 700,
            color: MCOLORS[0],
            opacity: 0.5,
            transform: 'rotate(-6deg)',
            lineHeight: 1,
          }}
        >
          ?
        </span>
        <div
          style={{
            position: 'absolute',
            inset: '16px 30px',
            borderRadius: 22,
            border: '2.5px dashed var(--m-line-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,.6)',
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 16,
              background: 'var(--m-ink-3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 22px rgba(0,0,0,.12)',
            }}
          >
            <Icon name='search' size={26} color='#fff' />
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          maxWidth: 380,
        }}
      >
        <div className='m-h2' style={{ fontSize: 25 }}>
          No results for "{query}"
        </div>
        <div className='m-lead' style={{ fontSize: 15 }}>
          Try a different name, or clear the search to see all your canvases.
        </div>
      </div>
      <button
        onClick={onClear}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--m-primary)',
          fontFamily: 'var(--ui)',
          fontSize: 15,
          fontWeight: 600,
          padding: 0,
        }}
      >
        Clear search
      </button>
    </div>
  )
}
